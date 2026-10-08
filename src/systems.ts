import {
  GAME_CONFIG,
  ResourceTier,
  ResourceSubType,
  WeatherConfig,
  BiomeConfig,
  ItemConfig,
  DifficultyModeId,
  SpecialNodeType,
} from './gameConfig';

// ============================================================================
// 1. RandomSystem (Deterministic Seeded PRNG via Mulberry32)
// ============================================================================
export class RandomSystem {
  private state: number;
  public seedStr: string;

  constructor(seedInput?: string) {
    this.seedStr = seedInput && seedInput.trim().length > 0
      ? seedInput.trim()
      : `RM-${Math.floor(100000 + Math.random() * 900000)}`;
    this.state = RandomSystem.hashString(this.seedStr);
  }

  public static hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Fork a sub-generator for a specific depth/stage so stage generation is strictly reproducible
  public fork(salt: string): RandomSystem {
    const sub = new RandomSystem(`${this.seedStr}::${salt}`);
    return sub;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public rangeInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  public rangeFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  public pickWeighted<T>(items: T[], getWeight: (item: T) => number): T {
    const total = items.reduce((acc, item) => acc + Math.max(0, getWeight(item)), 0);
    if (total <= 0) return items[0];
    let roll = this.next() * total;
    for (const item of items) {
      const w = Math.max(0, getWeight(item));
      if (roll < w) return item;
      roll -= w;
    }
    return items[items.length - 1];
  }
}

// ============================================================================
// 2. SaveSystem (Persistent LocalStorage State)
// ============================================================================
export interface PersistentSaveData {
  permanentGold: number;
  maxDepth: number;
  tutorialCompleted: boolean;
  homeLevels: Record<string, number>; // radar: 0..2, workshop: 0..2, furnace: 0..2
  unlockedCostumes: string[];
  costumeShards: Record<string, number>;
  equippedCostumeId: string;
  discoveredBiomes: string[];
  discoveredWeathers: string[];
  discoveredResources: string[];
  totalRuns: number;
  totalExtractions: number;
}

const SAVE_STORAGE_KEY = 'RANDOM_MINER_V1_5_SAVE';

export const SaveSystem = {
  getDefaultSave(): PersistentSaveData {
    return {
      permanentGold: 300, // Starter permanent gold so player can test wardrobe/home early
      maxDepth: 0,
      tutorialCompleted: false,
      homeLevels: {
        radar: 0,
        workshop: 0,
        furnace: 0,
      },
      unlockedCostumes: ['default_suit'],
      costumeShards: {
        crimson_pioneer: 0,
        abyss_diver: 0,
        golden_tycoon: 0,
        astral_voyager: 0,
      },
      equippedCostumeId: 'default_suit',
      discoveredBiomes: ['plains'],
      discoveredWeathers: ['sunny'],
      discoveredResources: ['r1_stone'],
      totalRuns: 0,
      totalExtractions: 0,
    };
  },

  load(): PersistentSaveData {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return this.getDefaultSave();
      const parsed = JSON.parse(raw);
      return {
        ...this.getDefaultSave(),
        ...parsed,
        homeLevels: { ...this.getDefaultSave().homeLevels, ...(parsed.homeLevels || {}) },
        costumeShards: { ...this.getDefaultSave().costumeShards, ...(parsed.costumeShards || {}) },
      };
    } catch {
      return this.getDefaultSave();
    }
  },

  save(data: PersistentSaveData): void {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save to localStorage', e);
    }
  },

  reset(): PersistentSaveData {
    const fresh = this.getDefaultSave();
    this.save(fresh);
    return fresh;
  },
};

// ============================================================================
// 3. HomeSystem & WardrobeSystem
// ============================================================================
export const HomeSystem = {
  isUnlockActive(save: PersistentSaveData, homeUnlockId?: string): boolean {
    if (!homeUnlockId) return true;
    const [deviceId, reqLevelStr] = homeUnlockId.split('_');
    const reqLevel = parseInt(reqLevelStr, 10);
    const currentLevel = save.homeLevels[deviceId] || 0;
    return currentLevel >= reqLevel;
  },

  getEligibleEquipmentPool(save: PersistentSaveData): ItemConfig[] {
    return GAME_CONFIG.ITEMS.filter(
      (item) => item.type === 'equipment' && this.isUnlockActive(save, item.homeUnlockId)
    );
  },

  getConsumablePool(): ItemConfig[] {
    return GAME_CONFIG.ITEMS.filter((item) => item.type === 'consumable');
  },
};

export const WardrobeSystem = {
  canUnlockWithGold(save: PersistentSaveData, costumeId: string): boolean {
    if (save.unlockedCostumes.includes(costumeId)) return false;
    const cfg = GAME_CONFIG.COSTUMES.find((c) => c.id === costumeId);
    if (!cfg) return false;
    return save.permanentGold >= cfg.priceGold;
  },

  canCraftWithShards(save: PersistentSaveData, costumeId: string): boolean {
    if (save.unlockedCostumes.includes(costumeId)) return false;
    const cfg = GAME_CONFIG.COSTUMES.find((c) => c.id === costumeId);
    if (!cfg || cfg.shardsRequired <= 0) return false;
    return (save.costumeShards[costumeId] || 0) >= cfg.shardsRequired;
  },
};

// ============================================================================
// 4. RunState & CheckpointSystem
// ============================================================================
export type RouteNodeType =
  | 'NODE_NORMAL'
  | 'NODE_CHECKPOINT'
  | 'NODE_REWARD_MINE'
  | 'NODE_TUTORIAL'
  | SpecialNodeType;

export interface RouteOption {
  id: string;
  type: RouteNodeType;
  displayType?: RouteNodeType; // Used when NODE_TRAP disguises itself!
  title: string;
  flavorText: string;
  subtitle: string;
  categoryBadge?: string;
  accentColor?: string;
  biomePreview?: BiomeConfig;
  weatherPreview?: WeatherConfig;
}

export interface CheckpointSnapshot {
  depth: number;
  normalFloorCount: number;
  hp: number;
  maxHp: number;
  totalEarnedGold: number;
  totalSpentGold: number;
  equipmentIds: string[];
  consumableIds: string[];
  pendingShards: Record<string, number>;
  curses: string[];
  fateBuffs: string[];
  parasiteFloorsLeft: number;
  contractSigned: boolean;
  luckyNails: number;
  luckyDiceOwned: number;
  luckyDiceUsedTotal: number;
  relicNextFloorBoost: boolean;
  lastNonFixedNodeType: RouteNodeType | null;
}

export interface RunState {
  runSeed: string;
  characterId: string;
  difficultyMode: DifficultyModeId;
  depth: number;
  normalFloorCount: number; // Increments on each Normal Floor (Goal = 800 * normalFloorCount)
  hp: number;
  maxHp: number;
  totalEarnedGold: number; // Cumulative gold earned this run (Never reduced by shop purchases!)
  totalSpentGold: number;  // Gold spent in shop/black market/forge/etc.
  equipmentIds: string[];
  consumableIds: string[];
  pendingShards: Record<string, number>; // Shards obtained during this run (banked on extraction)
  checkpoint: CheckpointSnapshot | null;
  currentNodeType: RouteNodeType;
  currentBiome: BiomeConfig;
  baseWeather: WeatherConfig;
  finalWeather: WeatherConfig;
  isTutorial: boolean;
  tutorialGrabs: number;
  collapseGrabs: number; // For NODE_COLLAPSE (need 3 grabs in 60s)
  noahComboCount: number; // For character Noah's every-3-grabs overload
  capacitorUsedThisFloor: boolean;
  jackFreeRerollUsed: boolean;
  lastFloorEarnedGold: number;
  // Expanded Roguelite State
  curses: string[]; // 'curse_max_hp' | 'curse_dmg_up' | 'curse_gold_down' | 'curse_bm_up'
  fateBuffs: string[]; // 'fate_greed' | 'fate_tenacity' | 'fate_fortune' | 'fate_reckless'
  parasiteFloorsLeft: number; // > 0 means infected (+20G, -3HP per floor, max 10 floors)
  contractSigned: boolean; // +30G per floor & +15% pull speed, but 0 gold on failure
  luckyNails: number; // Max 3 held at a time, unlimited total uses
  luckyDiceOwned: number; // Max 10 held, total crafted+used <= 10
  luckyDiceUsedTotal: number; // Max 10 per run
  relicNextFloorBoost: boolean; // Extra temporary equipment power on next floor
  lastNonFixedNodeType: RouteNodeType | null; // For NODE_ECHO
}

export const CheckpointSystem = {
  createSnapshot(run: RunState): CheckpointSnapshot {
    return {
      depth: run.depth,
      normalFloorCount: run.normalFloorCount,
      hp: run.hp,
      maxHp: run.maxHp,
      totalEarnedGold: run.totalEarnedGold,
      totalSpentGold: run.totalSpentGold,
      equipmentIds: [...run.equipmentIds],
      consumableIds: [...run.consumableIds],
      pendingShards: { ...run.pendingShards },
      curses: [...run.curses],
      fateBuffs: [...run.fateBuffs],
      parasiteFloorsLeft: run.parasiteFloorsLeft,
      contractSigned: run.contractSigned,
      luckyNails: run.luckyNails,
      luckyDiceOwned: run.luckyDiceOwned,
      luckyDiceUsedTotal: run.luckyDiceUsedTotal,
      relicNextFloorBoost: run.relicNextFloorBoost,
      lastNonFixedNodeType: run.lastNonFixedNodeType,
    };
  },

  restoreSnapshot(run: RunState, snap: CheckpointSnapshot): RunState {
    return {
      ...run,
      depth: snap.depth,
      normalFloorCount: snap.normalFloorCount,
      hp: snap.hp,
      maxHp: snap.maxHp,
      totalEarnedGold: snap.totalEarnedGold,
      totalSpentGold: snap.totalSpentGold,
      equipmentIds: [...snap.equipmentIds],
      consumableIds: [...snap.consumableIds],
      pendingShards: { ...snap.pendingShards },
      curses: [...snap.curses],
      fateBuffs: [...snap.fateBuffs],
      parasiteFloorsLeft: snap.parasiteFloorsLeft,
      contractSigned: snap.contractSigned,
      luckyNails: snap.luckyNails,
      luckyDiceOwned: snap.luckyDiceOwned,
      luckyDiceUsedTotal: snap.luckyDiceUsedTotal,
      relicNextFloorBoost: snap.relicNextFloorBoost,
      lastNonFixedNodeType: snap.lastNonFixedNodeType,
      checkpoint: snap,
    };
  },
};

// ============================================================================
// 5. WeatherSystem (Base Weather Roll -> Special Biome Combo Replacement)
// ============================================================================
export const WeatherSystem = {
  rollWeatherForBiome(rng: RandomSystem, biome: BiomeConfig): {
    baseWeather: WeatherConfig;
    finalWeather: WeatherConfig;
    isCombo: boolean;
  } {
    const baseWeather = rng.pickWeighted(GAME_CONFIG.BASE_WEATHERS, (w) => w.weight);
    const combo = GAME_CONFIG.SPECIAL_COMBO_WEATHERS.find(
      (cw) => cw.biomeTrigger === biome.id && cw.baseWeatherId === baseWeather.id
    );
    if (combo) {
      return {
        baseWeather,
        finalWeather: combo,
        isCombo: true,
      };
    }
    return {
      baseWeather,
      finalWeather: baseWeather,
      isCombo: false,
    };
  },
};

// ============================================================================
// 6. Depth Difficulty & Damage Calculation
// ============================================================================
export function getDepthDifficultyMultiplier(depth: number): number {
  for (const bracket of GAME_CONFIG.DEPTH_DIFFICULTY_CURVE) {
    if (depth >= bracket.min && depth <= bracket.max) {
      return bracket.mult;
    }
  }
  return 1.30;
}

// ============================================================================
// 7. ResourceSystem & ObstacleSystem (Entities in Mining Stage)
// ============================================================================
export interface MineResourceEntity {
  uid: string;
  subType: ResourceSubType;
  tier: ResourceTier;
  displayName: string;
  x: number;
  y: number;
  radius: number;
  weightLevel: number;
  basePrice: number;
  revealedPrice: boolean;
  grabbed: boolean;
  collected: boolean;
  pulsePhase: number;
}

export interface MineObstacleEntity {
  uid: string;
  type: 'static' | 'moving' | 'hazard';
  name: string;
  x: number;
  y: number;
  radius: number;
  vx: number;
  minX: number;
  maxX: number;
  baseDamage: number;
  hp: number;    // 3 hits to completely destroy!
  maxHp: number; // Default 3
  destroyed: boolean;
}

export const ResourceSystem = {
  generateStageResources(
    rng: RandomSystem,
    run: RunState,
    isBonusBed: boolean
  ): MineResourceEntity[] {
    const entities: MineResourceEntity[] = [];
    const biome = run.currentBiome;
    const weather = run.finalWeather;
    const diffMult = getDepthDifficultyMultiplier(run.depth);

    if (run.isTutorial) {
      const tutorialPresets: { subId: string; x: number; y: number }[] = [
        { subId: 'r1_stone', x: 130, y: 210 },
        { subId: 'r1_wood', x: 315, y: 220 },
        { subId: 'r2_copper', x: 225, y: 275 },
        { subId: 's2_diamond', x: 105, y: 360 },
        { subId: 'r3_iron', x: 340, y: 350 },
        { subId: 's1_gold_cluster', x: 225, y: 455 },
        { subId: 'm_mystery', x: 145, y: 490 },
        { subId: 'r2_salt', x: 315, y: 495 },
      ];
      tutorialPresets.forEach((p, idx) => {
        const sub = GAME_CONFIG.RESOURCE_SUBTYPES.find((s) => s.id === p.subId) || GAME_CONFIG.RESOURCE_SUBTYPES[0];
        const flavorList = biome.flavors[sub.tier] || [sub.name];
        const displayName = flavorList[idx % flavorList.length];
        const basePrice = rng.rangeInt(sub.minPrice, sub.maxPrice);
        entities.push({
          uid: `tut-res-${idx}`,
          subType: sub,
          tier: sub.tier,
          displayName,
          x: p.x,
          y: p.y,
          radius: sub.radius,
          weightLevel: sub.weightLevel,
          basePrice,
          revealedPrice: sub.tier !== 'M' || run.characterId === 'eileen',
          grabbed: false,
          collected: false,
          pulsePhase: idx * 0.7,
        });
      });
      return entities;
    }

    const weights: Record<ResourceTier, number> = { ...GAME_CONFIG.RESOURCE_TIER_WEIGHTS };
    weights.R1 *= weather.normalSpawnMult;
    weights.R2 *= weather.normalSpawnMult;

    const specialBoost =
      weather.specialSpawnMult *
      biome.specialWeightMod *
      (run.characterId === 'eileen' ? 1.35 : 1.0) *
      (run.fateBuffs.includes('fate_fortune') ? 1.40 : 1.0) *
      (run.consumableIds.includes('con_lucky_charm') ? 1.20 : 1.0) *
      (run.relicNextFloorBoost ? 1.25 : 1.0);

    weights.S1 *= specialBoost;
    weights.S2 *= specialBoost * (run.equipmentIds.includes('eq_home_sonar') ? 1.5 : 1.0);
    weights.M *= specialBoost;

    if (isBonusBed) {
      weights.R1 = 5;
      weights.R2 = 15;
      weights.R3 = 30;
      weights.S1 = 30;
      weights.S2 = 14;
      weights.M = 6;
    }

    const totalCount = isBonusBed
      ? 18
      : run.currentNodeType === 'NODE_COLLAPSE'
      ? 10
      : rng.rangeInt(15, 19);
    const minSpacing = Math.max(36, Math.round(48 / diffMult));

    const tiers: ResourceTier[] = ['R1', 'R2', 'R3', 'S1', 'S2', 'M'];
    const forcedTiers: ResourceTier[] = isBonusBed
      ? ['S1', 'S1', 'S2', 'S2', 'R3', 'R3']
      : run.currentNodeType === 'NODE_COLLAPSE'
      ? ['R1', 'R1', 'R2', 'R2', 'S2']
      : ['S1', 'S1', 'S2', 'R3', 'R3'];

    if (run.characterId === 'jack') {
      forcedTiers.push('M', 'M');
    }

    for (let i = 0; i < totalCount; i++) {
      const tier: ResourceTier =
        i < forcedTiers.length
          ? forcedTiers[i]
          : rng.pickWeighted(tiers, (t) => weights[t]);

      const candidates = GAME_CONFIG.RESOURCE_SUBTYPES.filter((s) => s.tier === tier);
      const sub = rng.pickWeighted(candidates, (c) => c.subWeight);
      const flavorList = biome.flavors[tier] || [sub.name];
      const displayName = flavorList[rng.rangeInt(0, flavorList.length - 1)];

      let x = 60;
      let y = 200;
      const yMin = tier === 'S1' || tier === 'S2' ? 280 : 165;
      const yMax = GAME_CONFIG.CANVAS_HEIGHT - 48;

      for (let attempt = 0; attempt < 30; attempt++) {
        const tx = rng.rangeInt(44, GAME_CONFIG.CANVAS_WIDTH - 44);
        const ty = rng.rangeInt(yMin, yMax);
        const tooClose = entities.some((other) => {
          const dx = other.x - tx;
          const dy = other.y - ty;
          return Math.hypot(dx, dy) < Math.max(minSpacing, other.radius + sub.radius + 8);
        });
        if (!tooClose) {
          x = tx;
          y = ty;
          break;
        }
        x = tx;
        y = ty;
      }

      let basePrice = rng.rangeInt(sub.minPrice, sub.maxPrice);
      if (tier === 'M' && run.characterId === 'jack') {
        basePrice = rng.rangeInt(15, 280);
      }

      const revealedPrice =
        tier !== 'M' ||
        run.characterId === 'eileen' ||
        run.equipmentIds.includes('eq_home_sonar');

      entities.push({
        uid: `res-${i}-${Math.floor(rng.next() * 10000)}`,
        subType: sub,
        tier,
        displayName,
        x,
        y,
        radius: sub.radius,
        weightLevel: sub.weightLevel,
        basePrice,
        revealedPrice,
        grabbed: false,
        collected: false,
        pulsePhase: rng.rangeFloat(0, Math.PI * 2),
      });
    }

    return entities;
  },

  calculateFinalPrice(
    res: MineResourceEntity,
    run: RunState,
    noahOverloadActive: boolean,
    magnetActive: boolean
  ): number {
    let price = res.basePrice;

    // 1. Price Amulet or Fate Fortune for Mystery Ore M
    if (res.tier === 'M') {
      if (run.fateBuffs.includes('fate_fortune') && price < 50) price = 50;
      if (run.equipmentIds.includes('eq_price_amulet') && price < 40) price = 40;
    }

    // 2. Weather multipliers
    const w = run.finalWeather;
    if (res.tier === 'S1' || res.tier === 'S2') {
      price *= w.specialPriceMult;
    }
    if (res.subType.isMetalOrEnergy) {
      price *= w.metalEnergyPriceMult;
    }

    // 3. Equipment & Relic multipliers
    if (res.subType.isMetalOrEnergy && run.equipmentIds.includes('eq_metal_finder')) {
      price *= 1.20;
    }
    if (
      (res.tier === 'S1' || res.tier === 'S2') &&
      run.equipmentIds.includes('eq_scavenger_bag') &&
      run.currentBiome.isScrapyardOrRuin
    ) {
      price *= 1.15;
    }
    if (
      (res.tier === 'S1' || res.tier === 'S2') &&
      run.equipmentIds.includes('eq_home_spectrometer')
    ) {
      price *= 1.20;
    }
    if (run.relicNextFloorBoost) {
      price *= 1.20;
    }

    // 4. Character passives
    if (run.characterId === 'barton' && res.weightLevel === 1) {
      price *= 1.20;
    }
    if (run.characterId === 'renn' && (w.id !== 'sunny' || w.isSpecialCombo)) {
      price *= 1.15;
    }
    if (run.characterId === 'rust') {
      if (res.tier === 'R1' || res.tier === 'R2') {
        price += 7;
      } else if (res.tier === 'S1') {
        price *= 0.85;
      }
    }
    if (noahOverloadActive) {
      price *= 1.25;
    }

    // 5. Fate & Curse modifiers
    if (run.fateBuffs.includes('fate_greed')) {
      price *= 1.25;
    }
    if (run.fateBuffs.includes('fate_tenacity') && res.tier === 'R1') {
      price *= 0.90;
    }
    if (run.curses.includes('curse_gold_down')) {
      const curseCount = run.curses.filter((c) => c === 'curse_gold_down').length;
      price *= Math.pow(0.85, curseCount);
    }

    // 6. Home Gold Core (+25 flat gold for weight >= 3)
    if (res.weightLevel >= 3 && run.equipmentIds.includes('eq_home_gold_core')) {
      price += 25;
    }

    // 7.的双倍回收券 (con_magnet: next resource price ×2)
    if (magnetActive) {
      price *= 2.0;
    }

    return Math.max(1, Math.round(price));
  },

  calculateRetrievalMetrics(
    weightLevel: number,
    tier: ResourceTier | null,
    obstaclePenaltyActive: boolean,
    run: RunState,
    overclockActive: boolean,
    noahOverloadActive: boolean
  ): {
    effectiveWeightFactor: number;
    obstaclePenalty: number;
    pullSpeedMultiplier: number;
    estimatedRetrievalSec: number;
    pullSpeedPxPerSec: number;
  } {
    let weightFactor = weightLevel;

    // 轻量挂钩 (eq_light_hook): 本局所有资源实际重量等级-1，最低1级
    if (run.equipmentIds.includes('eq_light_hook')) {
      weightFactor = Math.max(1, weightFactor - 1);
    }

    // 加固钢索 (eq_heavy_gloves): 本局重量与障碍回收惩罚×0.85
    if (run.equipmentIds.includes('eq_heavy_gloves')) {
      weightFactor *= 0.85;
    }
    if (weightLevel >= 3 && run.finalWeather.heavyWeightFactorMult) {
      weightFactor *= run.finalWeather.heavyWeightFactorMult;
    }

    let obstaclePenalty = obstaclePenaltyActive ? GAME_CONFIG.OBSTACLE_PENALTY_MULT : 1.0;
    if (obstaclePenaltyActive && run.equipmentIds.includes('eq_heavy_gloves')) {
      obstaclePenalty = 1 + (obstaclePenalty - 1) * 0.85;
    }
    // 防震护板 (eq_shock_plate): 本局撞击障碍后的回收减速惩罚减半
    if (obstaclePenaltyActive && run.equipmentIds.includes('eq_shock_plate')) {
      obstaclePenalty = 1 + (obstaclePenalty - 1) * 0.5;
    }

    let pullMult = 1.0;
    const hasSuperWinch = run.equipmentIds.includes('eq_home_super_winch');

    const weatherPull = hasSuperWinch
      ? Math.max(1.0, run.finalWeather.pullSpeedMult)
      : run.finalWeather.pullSpeedMult;
    const biomePull = hasSuperWinch
      ? Math.max(1.0, run.currentBiome.pullSpeedMod)
      : run.currentBiome.pullSpeedMod;

    pullMult *= weatherPull * biomePull;

    // 快速卷轴 (eq_power_winch): 本局回收速度+15%
    if (run.equipmentIds.includes('eq_power_winch')) pullMult *= 1.15;
    // 多功能绞盘 (eq_multi_winch): 本局出钩速度+10%，回收速度+10%，摆动幅度×0.95
    if (run.equipmentIds.includes('eq_multi_winch')) pullMult *= 1.10;
    if (hasSuperWinch) pullMult *= 1.40;
    if (run.relicNextFloorBoost) pullMult *= 1.20;
    if (run.contractSigned) pullMult *= 1.15;
    if (run.fateBuffs.includes('fate_greed')) pullMult *= 0.90;
    if (run.fateBuffs.includes('fate_reckless')) pullMult *= 1.30;

    if (run.characterId === 'lena' && tier === 'S1') pullMult *= 0.90;
    if (run.characterId === 'renn' && (run.finalWeather.id !== 'sunny' || run.finalWeather.isSpecialCombo)) {
      pullMult *= 1.30;
    }
    if (run.characterId === 'rust' && (tier === 'R1' || tier === 'R2')) {
      pullMult *= 1.45;
    }
    if (noahOverloadActive) pullMult *= 1.85;
    // 加速药剂 (con_overclock): 出钩速度与回收速度+25%
    if (overclockActive) pullMult *= 1.25;

    const estimatedRetrievalSec =
      (GAME_CONFIG.BASE_RETRIEVAL_TIME_SEC * weightFactor * obstaclePenalty) / pullMult;

    const weightSpeedDivisor = 0.55 + weightFactor * 0.45;
    const pullSpeedPxPerSec =
      (GAME_CONFIG.BASE_PULL_SPEED / (weightSpeedDivisor * obstaclePenalty)) * pullMult;

    return {
      effectiveWeightFactor: Number(weightFactor.toFixed(2)),
      obstaclePenalty,
      pullSpeedMultiplier: Number(pullMult.toFixed(2)),
      estimatedRetrievalSec: Number(estimatedRetrievalSec.toFixed(2)),
      pullSpeedPxPerSec,
    };
  },
};

export const ObstacleSystem = {
  generateStageObstacles(
    rng: RandomSystem,
    run: RunState,
    resources: MineResourceEntity[],
    isBonusBed: boolean
  ): MineObstacleEntity[] {
    if (isBonusBed) return [];

    const obstacles: MineObstacleEntity[] = [];
    const diffMult = getDepthDifficultyMultiplier(run.depth);
    const biome = run.currentBiome;

    if (run.isTutorial) {
      return [
        {
          uid: 'tut-obs-1',
          type: 'static',
          name: '风化岩障',
          x: 175,
          y: 330,
          radius: 22,
          vx: 0,
          minX: 175,
          maxX: 175,
          baseDamage: GAME_CONFIG.BASE_DAMAGE_STATIC_OBSTACLE,
          hp: 3,
          maxHp: 3,
          destroyed: false,
        },
        {
          uid: 'tut-obs-2',
          type: 'moving',
          name: '巡逻矿车',
          x: 280,
          y: 410,
          radius: 18,
          vx: 55,
          minX: 190,
          maxX: 380,
          baseDamage: GAME_CONFIG.BASE_DAMAGE_MOVING_OBSTACLE,
          hp: 3,
          maxHp: 3,
          destroyed: false,
        },
      ];
    }

    const staticCount = Math.min(
      8,
      Math.round((2 + biome.staticObstacleBonus) * diffMult)
    );
    const movingCount = Math.min(
      4,
      Math.round((1 + biome.movingObstacleBonus) * diffMult)
    );
    const hazardCount = run.depth >= 8 ? rng.rangeInt(1, 2) : 0;

    for (let i = 0; i < staticCount; i++) {
      let x = rng.rangeInt(55, GAME_CONFIG.CANVAS_WIDTH - 55);
      let y = rng.rangeInt(185, GAME_CONFIG.CANVAS_HEIGHT - 90);
      for (let attempt = 0; attempt < 20; attempt++) {
        const tx = rng.rangeInt(55, GAME_CONFIG.CANVAS_WIDTH - 55);
        const ty = rng.rangeInt(185, GAME_CONFIG.CANVAS_HEIGHT - 90);
        const overlapRes = resources.some((r) => Math.hypot(r.x - tx, r.y - ty) < r.radius + 28);
        const overlapObs = obstacles.some((o) => Math.hypot(o.x - tx, o.y - ty) < o.radius + 32);
        if (!overlapRes && !overlapObs) {
          x = tx;
          y = ty;
          break;
        }
      }
      obstacles.push({
        uid: `obs-static-${i}`,
        type: 'static',
        name: '坚硬岩层',
        x,
        y,
        radius: 21,
        vx: 0,
        minX: x,
        maxX: x,
        baseDamage: Math.round(GAME_CONFIG.BASE_DAMAGE_STATIC_OBSTACLE * diffMult),
        hp: 3,
        maxHp: 3,
        destroyed: false,
      });
    }

    for (let i = 0; i < movingCount; i++) {
      const y = rng.rangeInt(210, GAME_CONFIG.CANVAS_HEIGHT - 120);
      const minX = rng.rangeInt(45, 160);
      const maxX = rng.rangeInt(290, GAME_CONFIG.CANVAS_WIDTH - 45);
      const speed = (55 + i * 18) * diffMult * (rng.next() > 0.5 ? 1 : -1);
      obstacles.push({
        uid: `obs-moving-${i}`,
        type: 'moving',
        name: '失控矿车',
        x: Math.round((minX + maxX) / 2),
        y,
        radius: 18,
        vx: speed,
        minX,
        maxX,
        baseDamage: Math.round(GAME_CONFIG.BASE_DAMAGE_MOVING_OBSTACLE * diffMult),
        hp: 3,
        maxHp: 3,
        destroyed: false,
      });
    }

    for (let i = 0; i < hazardCount; i++) {
      const x = rng.rangeInt(65, GAME_CONFIG.CANVAS_WIDTH - 65);
      const y = rng.rangeInt(250, GAME_CONFIG.CANVAS_HEIGHT - 85);
      obstacles.push({
        uid: `obs-hazard-${i}`,
        type: 'hazard',
        name: '高压瓦斯囊',
        x,
        y,
        radius: 19,
        vx: 0,
        minX: x,
        maxX: x,
        baseDamage: Math.round(GAME_CONFIG.BASE_DAMAGE_SPECIAL_HAZARD * diffMult),
        hp: 3,
        maxHp: 3,
        destroyed: false,
      });
    }

    return obstacles;
  },
};

// ============================================================================
// 8. ShopSystem (Fixed 5 Items: 3 Consumables + 2 Equipment before Normal Floor)
// ============================================================================
export interface ShopOffer {
  slotIndex: number;
  item: ItemConfig;
  purchased: boolean;
}

export const ShopSystem = {
  generateShopOffers(
    rng: RandomSystem,
    save: PersistentSaveData,
    ownedEquipmentIds: string[]
  ): ShopOffer[] {
    const consumables = HomeSystem.getConsumablePool();
    const eligibleEquipment = HomeSystem.getEligibleEquipmentPool(save).filter(
      (eq) => !ownedEquipmentIds.includes(eq.id)
    );
    const fallbackEquipment = HomeSystem.getEligibleEquipmentPool(save);

    const offers: ShopOffer[] = [];

    const pickedConsumables: ItemConfig[] = [];
    for (let i = 0; i < 3; i++) {
      const pool = consumables.filter((c) => !pickedConsumables.includes(c));
      const choice = pool.length > 0 ? pool[rng.rangeInt(0, pool.length - 1)] : consumables[0];
      pickedConsumables.push(choice);
      offers.push({ slotIndex: i, item: choice, purchased: false });
    }

    const eqPool = eligibleEquipment.length >= 2 ? eligibleEquipment : fallbackEquipment;
    const pickedEq: ItemConfig[] = [];
    for (let i = 0; i < 2; i++) {
      const pool = eqPool.filter((e) => !pickedEq.includes(e));
      const choice = pool.length > 0 ? pool[rng.rangeInt(0, pool.length - 1)] : eqPool[0];
      pickedEq.push(choice);
      offers.push({ slotIndex: 3 + i, item: choice, purchased: ownedEquipmentIds.includes(choice.id) });
    }

    return offers;
  },
};

// ============================================================================
// 9. RouteSystem (3-Choice Route Generation, 4 Difficulty Modes & 16 Special Nodes)
// ============================================================================
export const RouteSystem = {
  generateRouteOptions(
    rng: RandomSystem,
    nextDepth: number,
    justFinishedTutorial: boolean,
    difficultyMode: DifficultyModeId = 'normal'
  ): RouteOption[] {
    // 1. Tutorial completion rule: First route after tutorial has fixed NODE_HEAL_50!
    if (justFinishedTutorial) {
      const b1 = GAME_CONFIG.BIOMES[0];
      const w1 = WeatherSystem.rollWeatherForBiome(rng, b1);
      const b2 = GAME_CONFIG.BIOMES[1];
      const w2 = WeatherSystem.rollWeatherForBiome(rng, b2);
      return [
        {
          id: `route-tut-heal50`,
          type: 'NODE_HEAL_50',
          title: '回复50层',
          flavorText: '前方有一处简易休整点。',
          subtitle: '【教程后固定首选路线】HP +50，最高恢复至 100',
          categoryBadge: '恢复续航类',
          accentColor: '#4ADE80',
        },
        {
          id: `route-tut-normal-1`,
          type: 'NODE_NORMAL',
          title: `普通层 · ${b1.name}`,
          flavorText: '前方传来矿脉/岩层的气息。',
          subtitle: `进入商店→购买道具→${b1.name} (${w1.finalWeather.name})`,
          categoryBadge: '普通矿脉',
          accentColor: '#FFE600',
          biomePreview: b1,
          weatherPreview: w1.finalWeather,
        },
        {
          id: `route-tut-normal-2`,
          type: 'NODE_NORMAL',
          title: `普通层 · ${b2.name}`,
          flavorText: '前方传来矿脉/岩层的气息。',
          subtitle: `进入商店→购买道具→${b2.name} (${w2.finalWeather.name})`,
          categoryBadge: '普通矿脉',
          accentColor: '#FFE600',
          biomePreview: b2,
          weatherPreview: w2.finalWeather,
        },
      ];
    }

    // 2. Fixed Depth 30, 60, 90... -> NODE_REWARD_MINE (Bonus Ore Bed + Auto Checkpoint!)
    if (nextDepth > 0 && nextDepth % GAME_CONFIG.BONUS_BED_DEPTH_INTERVAL === 0) {
      const bonusBiome = GAME_CONFIG.BIOMES[rng.rangeInt(0, GAME_CONFIG.BIOMES.length - 1)];
      return [
        {
          id: `route-bonus-${nextDepth}`,
          type: 'NODE_REWARD_MINE',
          title: `★ 奖励矿床 (深度 ${nextDepth} 固定层) ★`,
          flavorText: '矿脉深处闪着成片高价值矿光。',
          subtitle: '纯奖励矿床：60秒、固定晴天、高稀有资源，同时创建安全存档！',
          categoryBadge: '固定深度 · 奖励+存档',
          accentColor: '#FFE600',
          biomePreview: bonusBiome,
          weatherPreview: GAME_CONFIG.BASE_WEATHERS[0],
        },
      ];
    }

    // 3. Fixed Depth 10, 20, 40, 50... -> NODE_CHECKPOINT (Dedicated Checkpoint Layer!)
    if (nextDepth > 0 && nextDepth % GAME_CONFIG.CHECKPOINT_DEPTH_INTERVAL === 0) {
      return [
        {
          id: `route-checkpoint-${nextDepth}`,
          type: 'NODE_CHECKPOINT',
          title: `💾 存档层 (深度 ${nextDepth} 固定层)`,
          flavorText: '这里留下了可靠的补给记录。',
          subtitle: '保存当前深度、累计收益、HP、局内装备与未入库黑市碎片！',
          categoryBadge: '固定深度 · 存档节点',
          accentColor: '#38BDF8',
        },
      ];
    }

    // 4. Standard 3-Choice Random Route based on DifficultyMode (60/40, 70/30, 80/20, 90/10)
    const modeCfg =
      GAME_CONFIG.DIFFICULTY_MODES.find((m) => m.id === difficultyMode) ||
      GAME_CONFIG.DIFFICULTY_MODES[1];

    const createNormalOption = (idx: number): RouteOption => {
      const biome = rng.pickWeighted(GAME_CONFIG.BIOMES, (b) => b.weight);
      const wRoll = WeatherSystem.rollWeatherForBiome(rng, biome);
      return {
        id: `route-${nextDepth}-norm-${idx}`,
        type: 'NODE_NORMAL',
        title: `普通层 · ${biome.name} (${biome.region})`,
        flavorText: '前方传来矿脉/岩层的气息。',
        subtitle: `${wRoll.finalWeather.isSpecialCombo ? '⚡联动：' : '天气：'}${wRoll.finalWeather.name} · 课前商店→普通矿区`,
        categoryBadge: '普通矿脉 (判持有金币)',
        accentColor: '#FFE600',
        biomePreview: biome,
        weatherPreview: wRoll.finalWeather,
      };
    };

    const createSpecialOption = (idx: number): RouteOption => {
      // Pick from the 16-node Special Pool using exact 100% weights!
      const picked = rng.pickWeighted(GAME_CONFIG.SPECIAL_NODE_POOL, (item) => item.finalWeight);

      // If NODE_TRAP is rolled, it disguises itself on the route card as Chest / Heal / Black Market, with subtle hint!
      if (picked.type === 'NODE_TRAP') {
        const disguises = [
          { title: '宝箱层？', flavor: '这只宝箱看起来太新了。', sub: '道路尽头有一只闪亮的宝箱（疑似陷阱/20%真宝箱）' },
          { title: '回复50层？', flavor: '前方休整点的篝火过于整齐。', sub: '看似安全的休整点（疑似陷阱/20%真宝箱）' },
          { title: '黑市层？', flavor: '阴影里的商人露出了奇怪的微笑。', sub: '低价交易点（疑似陷阱/20%真宝箱）' },
        ];
        const dis = disguises[rng.rangeInt(0, disguises.length - 1)];
        return {
          id: `route-${nextDepth}-trap-${idx}`,
          type: 'NODE_TRAP',
          title: dis.title,
          flavorText: dis.flavor,
          subtitle: dis.sub,
          categoryBadge: picked.category,
          accentColor: picked.accentColor,
        };
      }

      return {
        id: `route-${nextDepth}-spec-${idx}-${picked.type}`,
        type: picked.type,
        title: picked.name,
        flavorText: picked.flavorText,
        subtitle: picked.ruleSummary,
        categoryBadge: `${picked.category} · 权重${picked.finalWeight}%`,
        accentColor: picked.accentColor,
      };
    };

    const options: RouteOption[] = [];
    // Roll 3 slots according to modeCfg.normalNodeProb vs specialNodeProb, ensuring at least 1 NODE_NORMAL
    for (let i = 0; i < 3; i++) {
      const isNormalRoll = rng.next() < modeCfg.normalNodeProb;
      if (isNormalRoll) {
        options.push(createNormalOption(i));
      } else {
        options.push(createSpecialOption(i));
      }
    }

    // Rule: Guarantee at least 1 NODE_NORMAL in every 3-choice route
    if (!options.some((o) => o.type === 'NODE_NORMAL')) {
      options[0] = createNormalOption(0);
    }

    return options;
  },
};
