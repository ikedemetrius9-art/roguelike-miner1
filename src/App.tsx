import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GAME_CONFIG, DifficultyModeId } from './gameConfig';
import {
  RandomSystem,
  SaveSystem,
  PersistentSaveData,
  HomeSystem,
  WeatherSystem,
  ShopSystem,
  ShopOffer,
  RouteSystem,
  RouteOption,
  RouteNodeType,
  CheckpointSystem,
  RunState,
} from './systems';
import { MineCanvas } from './MineCanvas';
import { SoundFX } from './sound';
import {
  DebugPanelContent,
  HomeView,
  WardrobeView,
  MallView,
  AdventurersView,
  CollectionView,
} from './Modals';
import { SpecialNodeView } from './SpecialNodeView';

type ScreenView =
  | 'title'
  | 'char_select'
  | 'home'
  | 'wardrobe'
  | 'mall'
  | 'adventurers'
  | 'collection'
  | 'shop'
  | 'mining'
  | 'special_node'
  | 'stage_clear'
  | 'route_select'
  | 'extract_summary'
  | 'fail_summary';

export default function App() {
  const [saveData, setSaveData] = useState<PersistentSaveData>(() => SaveSystem.load());
  const [view, setView] = useState<ScreenView>('title');
  const [selectedCharId, setSelectedCharId] = useState<string>('barton');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyModeId>('normal');
  const [seedInput, setSeedInput] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Active Run State
  const [run, setRun] = useState<RunState | null>(null);
  const [shopOffers, setShopOffers] = useState<ShopOffer[]>([]);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(120);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Temporary active buffs inside current mining stage
  const [activeBuffs, setActiveBuffs] = useState<{
    overclockSec: number;
    flareSec: number;
    magnetActive: boolean;
  }>({
    overclockSec: 0,
    flareSec: 0,
    magnetActive: false,
  });

  // Black market temporary stock
  const [blackMarketStock, setBlackMarketStock] = useState<
    { costumeId: string; name: string; price: number; bought: boolean }[]
  >([]);
  const [chestRewardGold, setChestRewardGold] = useState<number>(0);

  // Debug Panel visibility
  const [debugOpen, setDebugOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const triggerCarryDynamiteRef = useRef<(() => boolean) | null>(null);

  // Save helper
  const updateSave = useCallback((updater: (prev: PersistentSaveData) => PersistentSaveData) => {
    setSaveData((prev) => {
      const next = updater(prev);
      SaveSystem.save(next);
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 2800);
  }, []);

  // Expose GAME_CONFIG & SaveSystem to window for console debugging
  useEffect(() => {
    (window as unknown as Record<string, unknown>).GAME_CONFIG = GAME_CONFIG;
    (window as unknown as Record<string, unknown>).SaveSystem = SaveSystem;
  }, []);

  // Keyboard 'D' to toggle Debug Panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'd' || e.key === 'D') {
        setDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Tick temporary stage buffs (Overclock & Flare)
  useEffect(() => {
    if (view !== 'mining' || isPaused) return;
    const timer = setInterval(() => {
      setActiveBuffs((prev) => ({
        ...prev,
        overclockSec: Math.max(0, prev.overclockSec - 1),
        flareSec: Math.max(0, prev.flareSec - 1),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [view, isPaused]);

  // Helper to compute current normal floor cumulative target gold
  const getCurrentTargetGold = (r: RunState) =>
    GAME_CONFIG.NORMAL_FLOOR_GOAL_BASE * Math.max(1, r.normalFloorCount);

  // Helper to compute spendable gold in current run
  const getSpendableGold = (r: RunState) =>
    Math.max(0, r.totalEarnedGold - r.totalSpentGold);

  // Start a new Run (Normal or Tutorial)
  const startNewRun = (isTutorialMode: boolean) => {
    SoundFX.click();
    const finalSeed =
      seedInput.trim() ||
      `MINER-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const rng = new RandomSystem(`${finalSeed}::init`);
    const firstBiome = isTutorialMode
      ? GAME_CONFIG.BIOMES[0]
      : GAME_CONFIG.BIOMES[rng.rangeInt(0, 4)];

    const weatherRoll = isTutorialMode
      ? {
          baseWeather: GAME_CONFIG.BASE_WEATHERS[0],
          finalWeather: GAME_CONFIG.BASE_WEATHERS[0],
        }
      : WeatherSystem.rollWeatherForBiome(rng, firstBiome);

    const initialGold = selectedCharId === 'jack' ? 120 : 0;

    const newRun: RunState = {
      runSeed: finalSeed,
      characterId: selectedCharId,
      difficultyMode: selectedDifficulty,
      depth: 1,
      normalFloorCount: 1,
      hp: GAME_CONFIG.MAX_HP,
      maxHp: GAME_CONFIG.MAX_HP,
      totalEarnedGold: initialGold,
      totalSpentGold: 0,
      equipmentIds: [],
      consumableIds: [],
      pendingShards: {},
      checkpoint: null,
      currentNodeType: isTutorialMode ? 'NODE_TUTORIAL' : 'NODE_NORMAL',
      currentBiome: firstBiome,
      baseWeather: weatherRoll.baseWeather,
      finalWeather: weatherRoll.finalWeather,
      isTutorial: isTutorialMode,
      tutorialGrabs: 0,
      collapseGrabs: 0,
      noahComboCount: 0,
      capacitorUsedThisFloor: false,
      jackFreeRerollUsed: false,
      lastFloorEarnedGold: 0,
      curses: [],
      fateBuffs: [],
      parasiteFloorsLeft: 0,
      contractSigned: false,
      luckyNails: 0,
      luckyDiceOwned: 0,
      luckyDiceUsedTotal: 0,
      relicNextFloorBoost: false,
      lastNonFixedNodeType: 'NODE_NORMAL',
    };

    // Record biome & weather discovery
    updateSave((prev) => ({
      ...prev,
      discoveredBiomes: prev.discoveredBiomes.includes(firstBiome.id)
        ? prev.discoveredBiomes
        : [...prev.discoveredBiomes, firstBiome.id],
      discoveredWeathers: prev.discoveredWeathers.includes(weatherRoll.finalWeather.id)
        ? prev.discoveredWeathers
        : [...prev.discoveredWeathers, weatherRoll.finalWeather.id],
    }));

    setRun(newRun);
    setActiveBuffs({ overclockSec: 0, flareSec: 0, magnetActive: false });

    if (isTutorialMode) {
      setTimeRemaining(GAME_CONFIG.TUTORIAL_TIME_SEC);
      setView('mining');
    } else {
      const shopRng = new RandomSystem(`${finalSeed}::shop-d1-r0`);
      setShopOffers(ShopSystem.generateShopOffers(shopRng, saveData, []));
      setView('shop');
    }
  };

  // Enter Mining Stage from Shop
  const enterMiningFromShop = () => {
    if (!run) return;
    SoundFX.click();
    setTimeRemaining(GAME_CONFIG.NORMAL_FLOOR_TIME_SEC);
    setActiveBuffs({ overclockSec: 0, flareSec: 0, magnetActive: false });
    setRun((prev) => {
      if (!prev) return null;
      const shieldHeal = prev.equipmentIds.includes('eq_home_shield_vest') ? 15 : 0;
      return {
        ...prev,
        hp: Math.min(prev.maxHp, prev.hp + shieldHeal),
        lastFloorEarnedGold: 0,
        capacitorUsedThisFloor: false,
      };
    });
    setView('mining');
  };

  // Trigger Run Failure
  const triggerFailure = useCallback(() => {
    SoundFX.fail();
    setView('fail_summary');
  }, []);

  // Trigger Voluntary Extraction
  const triggerVoluntaryExtraction = () => {
    if (!run) return;
    SoundFX.stageClear();
    const netGold = Math.max(0, run.totalEarnedGold - run.totalSpentGold);
    updateSave((prev) => {
      const mergedShards = { ...prev.costumeShards };
      Object.entries(run.pendingShards).forEach(([cid, cnt]) => {
        mergedShards[cid] = (mergedShards[cid] || 0) + cnt;
      });
      return {
        ...prev,
        permanentGold: prev.permanentGold + netGold,
        costumeShards: mergedShards,
      };
    });
    setView('extract_summary');
  };

  // Handle end of Mining Stage
  const handleStageEnd = useCallback(
    (reason: 'time_up' | 'all_cleared' | 'hp_zero' | 'tutorial_done') => {
      if (!run) return;

      if (reason === 'hp_zero') {
        triggerFailure();
        return;
      }

      if (run.isTutorial) {
        SoundFX.stageClear();
        updateSave((prev) => ({ ...prev, tutorialCompleted: true }));
        setView('stage_clear');
        return;
      }

      // Bonus Ore Bed (Depth 30, 60, ...) has NO gold target check!
      if (run.currentNodeType === 'NODE_REWARD_MINE') {
        SoundFX.stageClear();
        setView('stage_clear');
        return;
      }

      // Collapse Node (60s to grab 3 ores; timeout deals -20HP and loses unbanked gold/shards)
      if (run.currentNodeType === 'NODE_COLLAPSE') {
        if (run.collapseGrabs >= 3) {
          SoundFX.stageClear();
          showToast('🎉 成功在塌方前采满 3 个矿点，安全脱离！');
          setView('stage_clear');
        } else {
          SoundFX.hitObstacle(true);
          const revertedEarned = run.checkpoint ? run.checkpoint.totalEarnedGold : 0;
          const revertedSpent = run.checkpoint ? run.checkpoint.totalSpentGold : 0;
          const revertedShards = run.checkpoint ? { ...run.checkpoint.pendingShards } : {};
          const nextHp = Math.max(0, run.hp - 20);
          setRun((prev) =>
            prev
              ? {
                  ...prev,
                  hp: nextHp,
                  totalEarnedGold: revertedEarned,
                  totalSpentGold: revertedSpent,
                  pendingShards: revertedShards,
                }
              : null
          );
          if (nextHp <= 0) {
            triggerFailure();
          } else {
            showToast('💥 塌方超时！扣除 20 HP 并丢失未入库收益！');
            setView('stage_clear');
          }
        }
        return;
      }

      // Normal floor: Check if cumulative earned gold >= targetGold (800 * normalFloorCount)
      const targetGold = GAME_CONFIG.NORMAL_FLOOR_GOAL_BASE * run.normalFloorCount;
      if (run.totalEarnedGold >= targetGold) {
        SoundFX.stageClear();
        setRun((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            relicNextFloorBoost: false,
          };
        });
        setView('stage_clear');
      } else {
        triggerFailure();
      }
    },
    [run, triggerFailure, updateSave, showToast]
  );

  // Proceed from Stage Clear or Special Node to Route Selection
  const proceedToRouteSelect = (warpDepthDelta = 1) => {
    if (!run) return;
    SoundFX.click();
    const nextDepth = run.depth + Math.max(1, warpDepthDelta);
    if (warpDepthDelta > 1) {
      setRun((prev) => (prev ? { ...prev, depth: nextDepth - 1 } : null));
    }
    const routeRng = new RandomSystem(`${run.runSeed}::route-d${nextDepth}`);
    const options = RouteSystem.generateRouteOptions(
      routeRng,
      nextDepth,
      run.isTutorial && run.depth === 1,
      run.difficultyMode
    );
    setRouteOptions(options);
    setView('route_select');
  };

  // Select one of the 3 routes
  const selectRouteNode = (option: RouteOption) => {
    if (!run) return;
    SoundFX.click();
    const nextDepth = run.depth + 1;
    const rng = new RandomSystem(`${run.runSeed}::node-d${nextDepth}-${option.id}`);

    // Apply Parasite per-layer effect (+20G, -3HP) and Contract per-layer effect (+30G)
    let layerBonusGold = 0;
    let layerHpLoss = 0;
    let nextParasiteFloors = run.parasiteFloorsLeft;
    if (run.parasiteFloorsLeft > 0) {
      layerBonusGold += 20;
      layerHpLoss += 3;
      nextParasiteFloors = run.parasiteFloorsLeft - 1;
    }
    if (run.contractSigned) {
      layerBonusGold += 30;
    }

    const baseNextHp = Math.max(1, run.hp - layerHpLoss);
    const baseNextEarnedGold = run.totalEarnedGold + layerBonusGold;
    const isFixedNode = option.type === 'NODE_CHECKPOINT' || option.type === 'NODE_REWARD_MINE';
    const nextLastNonFixed: RouteNodeType | null = isFixedNode
      ? run.lastNonFixedNodeType
      : option.type;

    if (option.type === 'NODE_NORMAL') {
      const nextNormalCount = run.isTutorial ? 1 : run.normalFloorCount + 1;
      const biome =
        option.biomePreview ||
        GAME_CONFIG.BIOMES[rng.rangeInt(0, GAME_CONFIG.BIOMES.length - 1)];
      const wRoll = WeatherSystem.rollWeatherForBiome(rng, biome);

      const updatedRun: RunState = {
        ...run,
        isTutorial: false,
        depth: nextDepth,
        normalFloorCount: nextNormalCount,
        hp: baseNextHp,
        totalEarnedGold: baseNextEarnedGold,
        parasiteFloorsLeft: nextParasiteFloors,
        lastFloorEarnedGold: 0,
        currentBiome: biome,
        baseWeather: wRoll.baseWeather,
        finalWeather: wRoll.finalWeather,
        currentNodeType: 'NODE_NORMAL',
        lastNonFixedNodeType: nextLastNonFixed,
        jackFreeRerollUsed: false,
      };

      updateSave((prev) => ({
        ...prev,
        discoveredBiomes: prev.discoveredBiomes.includes(biome.id)
          ? prev.discoveredBiomes
          : [...prev.discoveredBiomes, biome.id],
        discoveredWeathers: prev.discoveredWeathers.includes(wRoll.finalWeather.id)
          ? prev.discoveredWeathers
          : [...prev.discoveredWeathers, wRoll.finalWeather.id],
      }));

      setRun(updatedRun);
      const shopRng = new RandomSystem(`${run.runSeed}::shop-d${nextDepth}-r0`);
      setShopOffers(ShopSystem.generateShopOffers(shopRng, saveData, updatedRun.equipmentIds));
      setView('shop');
    } else if (option.type === 'NODE_REWARD_MINE') {
      // Every 30 depth: Pure Bonus Ore Bed + Checkpoint Snapshot
      const sunny = GAME_CONFIG.BASE_WEATHERS[0];
      const richBiome =
        option.biomePreview ||
        GAME_CONFIG.BIOMES.find((b) => b.id === 'crystal_cave') ||
        run.currentBiome;
      const tempRun: RunState = {
        ...run,
        isTutorial: false,
        depth: nextDepth,
        hp: baseNextHp,
        totalEarnedGold: baseNextEarnedGold,
        parasiteFloorsLeft: nextParasiteFloors,
        lastFloorEarnedGold: 0,
        currentBiome: richBiome,
        baseWeather: sunny,
        finalWeather: sunny,
        currentNodeType: 'NODE_REWARD_MINE',
      };
      tempRun.checkpoint = CheckpointSystem.createSnapshot(tempRun);
      setRun(tempRun);
      setTimeRemaining(GAME_CONFIG.BONUS_BED_TIME_SEC);
      setActiveBuffs({ overclockSec: 0, flareSec: 0, magnetActive: false });
      showToast('🎉 进入 30 深度奖励矿床！同时已为您创建中继存档点！');
      setView('mining');
    } else if (option.type === 'NODE_COLLAPSE') {
      // Collapse Node: 60s to grab 3 ores
      const collapseBiome =
        GAME_CONFIG.BIOMES.find((b) => b.id === 'abandoned_mine') || run.currentBiome;
      const wRoll = WeatherSystem.rollWeatherForBiome(rng, collapseBiome);
      const tempRun: RunState = {
        ...run,
        isTutorial: false,
        depth: nextDepth,
        hp: baseNextHp,
        totalEarnedGold: baseNextEarnedGold,
        parasiteFloorsLeft: nextParasiteFloors,
        lastFloorEarnedGold: 0,
        currentBiome: collapseBiome,
        baseWeather: wRoll.baseWeather,
        finalWeather: wRoll.finalWeather,
        currentNodeType: 'NODE_COLLAPSE',
        lastNonFixedNodeType: nextLastNonFixed,
        collapseGrabs: 0,
      };
      setRun(tempRun);
      setTimeRemaining(60);
      setActiveBuffs({ overclockSec: 0, flareSec: 0, magnetActive: false });
      showToast('🚨 进入塌方层！60秒内采集 3 个矿点即可安全冲出！');
      setView('mining');
    } else {
      // All interactive / instant Special Nodes handled in SpecialNodeView
      let nextHp = baseNextHp;
      let nextEarnedGold = baseNextEarnedGold;
      const nextCheckpoint = run.checkpoint;
      let nextParasite = nextParasiteFloors;

      if (option.type === 'NODE_HEAL_50') {
        SoundFX.heal();
        nextHp = Math.min(run.maxHp, baseNextHp + 50);
      } else if (option.type === 'NODE_HEAL_FULL') {
        SoundFX.heal();
        nextHp = run.maxHp;
      } else if (option.type === 'NODE_CHEST') {
        const reward = rng.rangeInt(100, 200);
        SoundFX.collectGold(reward);
        setChestRewardGold(reward);
        nextEarnedGold += reward;
      } else if (option.type === 'NODE_BLACK_MARKET') {
        const bmPriceMult = run.curses.includes('curse_bm_up') ? 1.2 : 1.0;
        const shardCostumes = GAME_CONFIG.COSTUMES.filter((c) => c.shardsRequired > 0);
        const stock = [0, 1, 2].map((i) => {
          const cos = shardCostumes[(nextDepth + i) % shardCostumes.length];
          return {
            costumeId: cos.id,
            name: `${cos.name}碎片`,
            price: Math.round(rng.rangeInt(110, 175) * bmPriceMult),
            bought: false,
          };
        });
        setBlackMarketStock(stock);
      } else if (option.type === 'NODE_UNKNOWN') {
        const reward = rng.rangeInt(100, 200);
        setChestRewardGold(reward);
        const bmPriceMult = run.curses.includes('curse_bm_up') ? 1.2 : 1.0;
        const shardCostumes = GAME_CONFIG.COSTUMES.filter((c) => c.shardsRequired > 0);
        setBlackMarketStock(
          [0, 1, 2].map((i) => {
            const cos = shardCostumes[(nextDepth + i) % shardCostumes.length];
            return {
              costumeId: cos.id,
              name: `${cos.name}碎片`,
              price: Math.round(rng.rangeInt(110, 175) * bmPriceMult),
              bought: false,
            };
          })
        );
      } else if (option.type === 'NODE_PARASITE') {
        nextParasite = 10;
      }

      const updatedRun: RunState = {
        ...run,
        isTutorial: false,
        depth: nextDepth,
        hp: nextHp,
        totalEarnedGold: nextEarnedGold,
        parasiteFloorsLeft: nextParasite,
        currentNodeType: option.type,
        lastNonFixedNodeType: nextLastNonFixed,
        checkpoint: nextCheckpoint,
      };

      if (option.type === 'NODE_CHECKPOINT') {
        updatedRun.checkpoint = CheckpointSystem.createSnapshot(updatedRun);
      }

      setRun(updatedRun);
      setView('special_node');
    }
  };

  // Buy Shop Item
  const handleBuyShopItem = (slotIndex: number) => {
    if (!run) return;
    const offer = shopOffers[slotIndex];
    if (!offer || offer.purchased) return;
    const price = Math.round(offer.item.price * (run.characterId === 'jack' ? 0.85 : 1.0));
    const spendable = getSpendableGold(run);
    if (spendable < price) {
      showToast('可用金币不足！');
      return;
    }

    SoundFX.buyItem();
    setShopOffers((prev) =>
      prev.map((s, idx) => (idx === slotIndex ? { ...s, purchased: true } : s))
    );

    setRun((prev) => {
      if (!prev) return null;
      const nextSpent = prev.totalSpentGold + price;
      if (offer.item.type === 'equipment') {
        return {
          ...prev,
          totalSpentGold: nextSpent,
          equipmentIds: prev.equipmentIds.includes(offer.item.id)
            ? prev.equipmentIds
            : [...prev.equipmentIds, offer.item.id],
        };
      } else {
        return {
          ...prev,
          totalSpentGold: nextSpent,
          consumableIds: [...prev.consumableIds, offer.item.id],
        };
      }
    });
  };

  // Refresh Shop
  const handleRefreshShop = () => {
    if (!run) return;
    const isFreeJack = run.characterId === 'jack' && !run.jackFreeRerollUsed;
    const cost = isFreeJack ? 0 : 40;
    if (getSpendableGold(run) < cost) {
      showToast('可用金币不足以刷新商店！');
      return;
    }
    SoundFX.click();
    const shopRng = new RandomSystem(`${run.runSeed}::shop-d${run.depth}-r${Date.now()}`);
    setShopOffers(ShopSystem.generateShopOffers(shopRng, saveData, run.equipmentIds));
    setRun((prev) =>
      prev
        ? {
            ...prev,
            totalSpentGold: prev.totalSpentGold + cost,
            jackFreeRerollUsed: prev.characterId === 'jack' ? true : prev.jackFreeRerollUsed,
          }
        : null
    );
  };

  // Use Consumable during Mining
  const handleUseConsumable = (itemId: string) => {
    if (!run || view !== 'mining' || isPaused) return;
    const idx = run.consumableIds.indexOf(itemId);
    if (idx === -1) return;

    if (itemId === 'con_dynamite') {
      const triggered = triggerCarryDynamiteRef.current?.() ?? false;
      if (!triggered) {
        showToast('当前没有正在抓取的重物或可清除的障碍！');
        return;
      }
    } else if (itemId === 'con_medkit') {
      SoundFX.heal();
      setRun((prev) =>
        prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + 30) } : null
      );
      showToast('💉 急救喷雾已使用：恢复 +30 HP！');
    } else if (itemId === 'con_overclock') {
      SoundFX.buyItem();
      setActiveBuffs((prev) => ({ ...prev, overclockSec: prev.overclockSec + 18 }));
      showToast('⚡ 超频电池激活：18秒内发射与回收速度 +65%！');
    } else if (itemId === 'con_flare') {
      SoundFX.buyItem();
      setActiveBuffs((prev) => ({ ...prev, flareSec: prev.flareSec + 30 }));
      showToast('🔦 强光信标升空：30秒内驱散迷雾并高亮矿石！');
    } else if (itemId === 'con_magnet') {
      SoundFX.buyItem();
      setActiveBuffs((prev) => ({ ...prev, magnetActive: true }));
      showToast('🧲 聚金磁铁就绪：下一次抓获矿石金币 ×1.6 倍！');
    } else if (itemId === 'con_hourglass') {
      SoundFX.buyItem();
      setTimeRemaining((prev) => prev + 20);
      showToast('⏳ 延时沙漏生效：本层剩余时间 +20 秒！');
    }

    setRun((prev) => {
      if (!prev) return null;
      // Check Capacitor equipment (50% chance to refund first consumable used each floor)
      if (
        prev.equipmentIds.includes('eq_capacitor') &&
        !prev.capacitorUsedThisFloor &&
        Math.random() < 0.5
      ) {
        showToast('🔋 储能器触发：本次消耗品免费返还！');
        return { ...prev, capacitorUsedThisFloor: true };
      }
      const nextConsumables = [...prev.consumableIds];
      const removeAt = nextConsumables.indexOf(itemId);
      if (removeAt !== -1) nextConsumables.splice(removeAt, 1);
      return {
        ...prev,
        consumableIds: nextConsumables,
        capacitorUsedThisFloor: true,
      };
    });
  };

  // Failure Option A: Resume from Checkpoint
  const handleResumeCheckpoint = () => {
    if (!run || !run.checkpoint) return;
    SoundFX.click();
    const restored = CheckpointSystem.restoreSnapshot(run, run.checkpoint);
    setRun(restored);
    const routeRng = new RandomSystem(
      `${restored.runSeed}::route-d${restored.depth + 1}-retry-${Date.now()}`
    );
    setRouteOptions(
      RouteSystem.generateRouteOptions(
        routeRng,
        restored.depth + 1,
        false,
        restored.difficultyMode
      )
    );
    showToast(`💾 已回退至深度 ${restored.depth} 存档点继续探险！`);
    setView('route_select');
  };

  // Failure Option B: Settle Now (Keep 30% gold, or 0% if Contract signed; lose unbanked Black Market shards)
  const handleFailureSettle = () => {
    if (!run) return;
    SoundFX.click();
    const netGold = Math.max(0, run.totalEarnedGold - run.totalSpentGold);
    const keptGold = run.contractSigned ? 0 : Math.floor(netGold * 0.3);
    updateSave((prev) => ({
      ...prev,
      permanentGold: prev.permanentGold + keptGold,
    }));
    showToast(
      run.contractSigned
        ? '⚠️ 因签订矿灵契约，失败结算带回 0 金币'
        : `已带回 30% 折损金币 (+${keptGold}G) 返回营地`
    );
    setRun(null);
    setView('title');
  };

  const currentCharacter =
    GAME_CONFIG.CHARACTERS.find((c) => c.id === (run?.characterId || selectedCharId)) ||
    GAME_CONFIG.CHARACTERS[0];
  const currentCostume =
    GAME_CONFIG.COSTUMES.find((c) => c.id === saveData.equippedCostumeId) ||
    GAME_CONFIG.COSTUMES[0];

  const unlockedEqCount = HomeSystem.getEligibleEquipmentPool(saveData).filter(
    (i) => i.homeUnlockId
  ).length;

  return (
    <div className="min-h-screen w-full bg-[#FFFDF7] memphis-bg-pattern text-[#111827] flex items-center justify-center p-0 sm:p-3 overflow-hidden">
      {/* 9:16 Vertical Arcade Cabinet Container (Memphis Neo-Brutalist Frame) */}
      <div className="relative w-full max-w-[450px] h-[100dvh] sm:h-[820px] sm:max-h-[95dvh] bg-[#FFFDF7] sm:rounded-2xl border-0 sm:border-4 border-[#111827] sm:shadow-[8px_8px_0px_#111827] flex flex-col overflow-hidden">
        {/* Global Toast Notification */}
        {toastMsg && (
          <div className="pointer-events-none absolute top-14 left-4 right-4 z-50 bg-[#FFDE00] border-3 border-[#111827] text-[#111827] text-xs font-extrabold px-3.5 py-2 rounded-xl text-center shadow-[4px_4px_0px_#111827]">
            {toastMsg}
          </div>
        )}

        {/* ===================================================================
            TOP UTILITY & HUD BAR (Memphis Style)
        =================================================================== */}
        {run &&
        (view === 'mining' ||
          view === 'shop' ||
          view === 'stage_clear' ||
          view === 'route_select' ||
          view === 'special_node') ? (
          <header className="w-full bg-[#FFDE00] border-b-3 border-[#111827] px-3 py-2 shrink-0 space-y-1.5">
            {/* Row 1: Depth, Normal Floor, Weather, Biome, Utility Buttons */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-display font-extrabold text-[#111827] bg-white border-2 border-[#111827] px-2 py-0.5 rounded-lg shadow-[2px_2px_0px_#111827]">
                  深度 {run.depth}
                </span>
                <span className="text-[#111827] font-mono-num font-extrabold bg-[#4ADE80] border-2 border-[#111827] px-1.5 py-0.5 rounded-lg text-[11px]">
                  {run.isTutorial ? '教程' : `普通#${run.normalFloorCount}`}
                </span>
                <span className="px-1.5 py-0.5 rounded-lg bg-white border-2 border-[#111827] text-[#111827] font-bold text-[11px]">
                  {run.currentBiome.name}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-lg text-[11px] font-extrabold border-2 border-[#111827] ${
                    run.finalWeather.isSpecialCombo
                      ? 'bg-[#C084FC] text-[#111827]'
                      : 'bg-[#38BDF8] text-[#111827]'
                  }`}
                >
                  {run.finalWeather.isSpecialCombo ? '⚡' : ''}
                  {run.finalWeather.name}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {view === 'mining' && (
                  <button
                    onClick={() => setIsPaused((p) => !p)}
                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-gray-100 border-2 border-[#111827] text-[11px] font-extrabold text-[#111827] shadow-[1px_1px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    {isPaused ? '继续' : '暂停'}
                  </button>
                )}
                <button
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    SoundFX.enabled = next;
                  }}
                  className="px-1.5 py-0.5 rounded-lg bg-white hover:bg-gray-100 border-2 border-[#111827] text-[11px] text-[#111827] shadow-[1px_1px_0px_#111827] cursor-pointer"
                  title="音效开关"
                >
                  {soundEnabled ? '🔊' : '🔇'}
                </button>
                <button
                  onClick={() => setDebugOpen((d) => !d)}
                  className="px-2 py-0.5 rounded-lg bg-[#FF6B6B] text-white border-2 border-[#111827] text-[11px] font-mono-num font-extrabold shadow-[1px_1px_0px_#111827] cursor-pointer"
                  title="打开调试面板 (快捷键 D)"
                >
                  DBG
                </button>
              </div>
            </div>

            {/* Row 2: Cumulative Gold vs Target Gold, HP Bar, Remaining Time */}
            <div className="grid grid-cols-3 gap-1.5 items-center pt-0.5">
              {/* Cumulative Gold / Target */}
              <div className="bg-white border-2 border-[#111827] rounded-lg px-2 py-1 shadow-[2px_2px_0px_#111827]">
                <div className="text-[10px] font-bold text-[#4B5563] flex items-center justify-between">
                  <span>累计 / 目标</span>
                  {run.totalEarnedGold >= getCurrentTargetGold(run) && !run.isTutorial && (
                    <span className="text-[#059669] font-extrabold">已达标</span>
                  )}
                </div>
                <div className="font-mono-num text-xs font-extrabold text-[#111827] truncate">
                  {run.totalEarnedGold}
                  <span className="text-[#6B7280] font-normal"> / </span>
                  <span className="text-[#D97706]">
                    {run.isTutorial
                      ? `${run.tutorialGrabs}/${GAME_CONFIG.TUTORIAL_TARGET_COUNT}矿`
                      : run.currentNodeType === 'NODE_REWARD_MINE'
                      ? '纯奖励'
                      : run.currentNodeType === 'NODE_COLLAPSE'
                      ? `${run.collapseGrabs}/3矿`
                      : `${getCurrentTargetGold(run)}G`}
                  </span>
                </div>
              </div>

              {/* HP Bar */}
              <div className="bg-white border-2 border-[#111827] rounded-lg px-2 py-1 shadow-[2px_2px_0px_#111827]">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-[#4B5563]">HP</span>
                  <span
                    className={`font-mono-num font-extrabold ${
                      run.hp <= 25 ? 'text-[#DC2626]' : 'text-[#059669]'
                    }`}
                  >
                    {run.hp}/{run.maxHp}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 border border-[#111827] rounded-full overflow-hidden mt-0.5">
                  <div
                    className={`h-full transition-all ${
                      run.hp <= 25
                        ? 'bg-[#EF4444]'
                        : run.hp <= 55
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#4ADE80]'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, (run.hp / run.maxHp) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Timer & Checkpoint Badge */}
              <div className="bg-white border-2 border-[#111827] rounded-lg px-2 py-1 flex items-center justify-between shadow-[2px_2px_0px_#111827]">
                <div>
                  <div className="text-[10px] font-bold text-[#4B5563]">限时</div>
                  <div
                    className={`font-mono-num text-xs font-extrabold ${
                      timeRemaining <= 10 && view === 'mining' ? 'text-[#DC2626]' : 'text-[#111827]'
                    }`}
                  >
                    {view === 'mining' ? `${timeRemaining}s` : '--'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold text-[#4B5563]">可用金币</div>
                  <div className="font-mono-num text-[11px] text-[#059669] font-extrabold">
                    {getSpendableGold(run)}G
                  </div>
                </div>
              </div>
            </div>

            {/* Active Curses / Fate / Parasite / Lucky Items mini strip */}
            {(run.curses.length > 0 ||
              run.fateBuffs.length > 0 ||
              run.parasiteFloorsLeft > 0 ||
              run.luckyNails > 0 ||
              run.luckyDiceOwned > 0 ||
              run.checkpoint) && (
              <div className="flex items-center gap-1 flex-wrap pt-0.5 text-[10px] font-extrabold">
                {run.checkpoint && (
                  <span className="px-1.5 py-0.2 bg-[#38BDF8] border border-[#111827] rounded">
                    💾存档:D{run.checkpoint.depth}
                  </span>
                )}
                {run.luckyNails > 0 && (
                  <span className="px-1.5 py-0.2 bg-white border border-[#111827] rounded">
                    📌幸运钉×{run.luckyNails}
                  </span>
                )}
                {run.luckyDiceOwned > 0 && (
                  <span className="px-1.5 py-0.2 bg-white border border-[#111827] rounded">
                    🎲幸运骰×{run.luckyDiceOwned}
                  </span>
                )}
                {run.parasiteFloorsLeft > 0 && (
                  <span className="px-1.5 py-0.2 bg-[#F3E8FF] border border-[#111827] rounded text-[#6B21A8]">
                    🦠寄生({run.parasiteFloorsLeft}层)
                  </span>
                )}
                {run.curses.map((cid, i) => {
                  const c = GAME_CONFIG.CURSES.find((x) => x.id === cid);
                  return (
                    <span
                      key={`${cid}-${i}`}
                      className="px-1.5 py-0.2 bg-[#FEE2E2] border border-[#111827] rounded text-[#DC2626]"
                    >
                      🕸️{c?.name || cid}
                    </span>
                  );
                })}
                {run.fateBuffs.map((fid, i) => {
                  const f = GAME_CONFIG.FATE_BUFFS.find((x) => x.id === fid);
                  return (
                    <span
                      key={`${fid}-${i}`}
                      className="px-1.5 py-0.2 bg-[#E0F2FE] border border-[#111827] rounded text-[#0369A1]"
                    >
                      🔮{f?.name || fid}
                    </span>
                  );
                })}
              </div>
            )}
          </header>
        ) : (
          /* Non-Run Header Bar (Memphis Style) */
          <header className="w-full bg-[#FFDE00] border-b-3 border-[#111827] px-4 py-2.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FF6B6B] border-2 border-[#111827]" />
              <span className="font-display font-extrabold text-sm tracking-wide text-[#111827]">
                随机矿工 V1.5
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono-num text-[#111827] font-extrabold bg-white px-2.5 py-0.5 rounded-lg border-2 border-[#111827] shadow-[2px_2px_0px_#111827]">
                💰 {saveData.permanentGold} G
              </span>
              <button
                onClick={() => setDebugOpen((d) => !d)}
                className="px-2 py-0.5 rounded-lg bg-[#FF6B6B] text-white border-2 border-[#111827] text-[11px] font-mono-num font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer"
              >
                DBG
              </button>
            </div>
          </header>
        )}

        {/* ===================================================================
            MAIN STAGE AREA
        =================================================================== */}
        <main className="relative flex-1 flex flex-col overflow-hidden">
          {/* 1. TITLE SCREEN (Vibrant Memphis Pop Style) */}
          {view === 'title' && (
            <div className="flex-1 flex flex-col justify-between p-5 bg-[#FFFDF7] memphis-dots overflow-y-auto">
              <div className="space-y-3 text-center mt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#38BDF8] border-2 border-[#111827] text-[#111827] text-xs font-extrabold shadow-[2px_2px_0px_#111827]">
                  ✨ 孟菲斯街机版 · 黄金矿工 × Roguelite 搜打撤
                </div>
                <div className="p-4 bg-[#FFDE00] border-3 border-[#111827] rounded-2xl shadow-[5px_5px_0px_#111827]">
                  <h1 className="font-display text-4xl font-extrabold tracking-tight text-[#111827]">
                    随机矿工
                  </h1>
                  <p className="text-xs font-bold text-[#111827]/80 mt-1">
                    动态天气联动 · 19种随机事件节点 · 障碍3次销毁 · 撤离博弈
                  </p>
                </div>

                {/* Tactile Memphis Visual Showcase Card */}
                <div className="mx-auto w-full p-3.5 rounded-2xl bg-white border-3 border-[#111827] shadow-[4px_4px_0px_#111827] flex items-center justify-around">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-[#FFDE00] border-2 border-[#111827] shadow-[2px_2px_0px_#111827] flex items-center justify-center font-mono-num text-xs font-extrabold text-[#111827]">
                      S1
                    </div>
                    <span className="text-[11px] font-extrabold text-[#111827]">高价金簇</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-xl bg-[#38BDF8] border-2 border-[#111827] shadow-[2px_2px_0px_#111827] flex items-center justify-center text-lg">
                      🪝
                    </div>
                    <span className="text-[11px] font-extrabold text-[#111827]">爽快震感抓矿</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-lg bg-[#C084FC] border-2 border-[#111827] shadow-[2px_2px_0px_#111827] flex items-center justify-center font-mono-num text-xs font-extrabold text-[#111827]">
                      19种
                    </div>
                    <span className="text-[11px] font-extrabold text-[#111827]">奇遇矿层</span>
                  </div>
                </div>
              </div>

              {/* Primary Navigation Buttons */}
              <div className="space-y-2.5 my-auto pt-3">
                <button
                  onClick={() => {
                    SoundFX.click();
                    setView('char_select');
                  }}
                  className="w-full py-3.5 px-4 bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] border-3 border-[#111827] font-extrabold text-base rounded-xl shadow-[4px_4px_0px_#111827] transition-all whitespace-nowrap cursor-pointer"
                >
                  🚀 进入探险 (选择角色与难度)
                </button>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      SoundFX.click();
                      setView('home');
                    }}
                    className="py-3 px-3 bg-[#4ADE80] hover:bg-[#22C55E] border-3 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827] shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    🏠 家园研发工坊
                  </button>
                  <button
                    onClick={() => {
                      SoundFX.click();
                      setView('wardrobe');
                    }}
                    className="py-3 px-3 bg-[#C084FC] hover:bg-[#A855F7] border-3 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827] shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    👕 衣柜与外观
                  </button>
                  <button
                    onClick={() => {
                      SoundFX.click();
                      setView('mall');
                    }}
                    className="py-3 px-3 bg-[#38BDF8] hover:bg-[#0EA5E9] border-3 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827] shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    🛒 碎片商城
                  </button>
                  <button
                    onClick={() => {
                      SoundFX.click();
                      setView('adventurers');
                    }}
                    className="py-3 px-3 bg-[#FB923C] hover:bg-[#F97316] border-3 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827] shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    ⛏️ 冒险者名册
                  </button>
                </div>

                <button
                  onClick={() => {
                    SoundFX.click();
                    setView('collection');
                  }}
                  className="w-full py-2.5 px-3 bg-white hover:bg-gray-100 border-3 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827] shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                >
                  📖 藏品与天气联动图鉴 ({saveData.discoveredWeathers.length}/29)
                </button>
              </div>

              <div className="text-center text-[11px] font-bold text-[#4B5563]">
                永久金币：{saveData.permanentGold} G · 已解锁家园装备：{unlockedEqCount}/6
              </div>
            </div>
          )}

          {/* 2. CHARACTER & DIFFICULTY SELECTION SCREEN */}
          {view === 'char_select' && (
            <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
              <div className="p-2.5 bg-[#FFDE00] border-3 border-[#111827] rounded-xl shadow-[3px_3px_0px_#111827] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-[#111827]">
                    选择探险角色与路线模式
                  </h2>
                  <p className="text-[11px] font-bold text-[#111827]/80">
                    全角色免费开放 · 不同模式决定普通矿脉与特殊事件层占比
                  </p>
                </div>
              </div>

              {/* Difficulty Mode Selector (Easy / Normal / Hard / Hell) */}
              <div className="mt-2 bg-white border-3 border-[#111827] rounded-xl p-2.5 shadow-[3px_3px_0px_#111827]">
                <div className="text-[11px] font-extrabold text-[#111827] mb-1.5">
                  🎲 路线难度模式（控制普通矿脉 vs 特殊事件层出现占比）：
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {GAME_CONFIG.DIFFICULTY_MODES.map((dm) => {
                    const active = selectedDifficulty === dm.id;
                    return (
                      <button
                        key={dm.id}
                        onClick={() => {
                          SoundFX.click();
                          setSelectedDifficulty(dm.id);
                        }}
                        className={`py-1.5 px-1 rounded-lg border-2 border-[#111827] text-center transition-all cursor-pointer ${
                          active
                            ? 'bg-[#FFDE00] shadow-[2px_2px_0px_#111827] font-extrabold'
                            : 'bg-[#FFFDF7] hover:bg-gray-100 font-bold'
                        }`}
                      >
                        <div className="text-xs text-[#111827]">{dm.name}</div>
                        <div className="text-[10px] font-mono-num text-[#4B5563]">
                          矿{Math.round(dm.normalNodeProb * 100)}%/特{Math.round(dm.specialNodeProb * 100)}%
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Character List */}
              <div className="flex-1 overflow-y-auto my-2 space-y-2 pr-1">
                {GAME_CONFIG.CHARACTERS.map((char) => {
                  const isSelected = char.id === selectedCharId;
                  return (
                    <div
                      key={char.id}
                      onClick={() => {
                        SoundFX.click();
                        setSelectedCharId(char.id);
                      }}
                      className={`p-2.5 rounded-xl border-3 border-[#111827] transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FEF9C3] shadow-[4px_4px_0px_#111827]'
                          : 'bg-white hover:bg-gray-50 shadow-[2px_2px_0px_#111827]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border-2 border-[#111827]"
                            style={{ backgroundColor: char.primaryColor }}
                          />
                          <span className="font-extrabold text-xs text-[#111827]">
                            {char.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#38BDF8] text-[#111827] border border-[#111827] font-extrabold">
                            {char.title}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-extrabold bg-[#4ADE80] border border-[#111827] px-1.5 py-0.2 rounded text-[#111827]">
                            ✓ 当前选择
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-[#111827] leading-snug">
                        {char.ruleDesc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Seed Input & Action Buttons */}
              <div className="space-y-2 pt-2 border-t-2 border-[#111827]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-[#111827] shrink-0">
                    随机种子:
                  </span>
                  <input
                    type="text"
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    placeholder="留空自动生成 (同Seed复现矿区/天气)"
                    className="flex-1 px-2.5 py-1 bg-white border-2 border-[#111827] rounded-lg text-xs text-[#111827] font-mono-num"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => startNewRun(false)}
                    className="py-2.5 px-3 bg-[#4ADE80] hover:bg-[#22C55E] text-[#111827] border-3 border-[#111827] font-extrabold text-xs rounded-xl shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    🚀 正式深入 (深度1)
                  </button>
                  <button
                    onClick={() => startNewRun(true)}
                    className="py-2.5 px-3 bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#111827] border-3 border-[#111827] font-extrabold text-xs rounded-xl shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    🎓 新手教程层
                  </button>
                </div>

                <button
                  onClick={() => setView('title')}
                  className="w-full py-2 bg-[#FF6B6B] text-white border-2 border-[#111827] text-xs font-extrabold rounded-xl shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
                >
                  返回主界面
                </button>
              </div>
            </div>
          )}

          {/* 3. META VIEWS */}
          {view === 'home' && (
            <HomeView
              saveData={saveData}
              updateSave={updateSave}
              onBack={() => setView('title')}
              showToast={showToast}
            />
          )}
          {view === 'wardrobe' && (
            <WardrobeView
              saveData={saveData}
              updateSave={updateSave}
              onBack={() => setView('title')}
              showToast={showToast}
            />
          )}
          {view === 'mall' && (
            <MallView
              saveData={saveData}
              updateSave={updateSave}
              onBack={() => setView('title')}
              showToast={showToast}
            />
          )}
          {view === 'adventurers' && (
            <AdventurersView
              saveData={saveData}
              updateSave={updateSave}
              onBack={() => setView('title')}
              onGoCharSelect={() => setView('char_select')}
              showToast={showToast}
            />
          )}
          {view === 'collection' && (
            <CollectionView
              saveData={saveData}
              updateSave={updateSave}
              onBack={() => setView('title')}
              showToast={showToast}
            />
          )}

          {/* 4. NORMAL FLOOR PRE-STAGE SHOP (Memphis Style) */}
          {view === 'shop' && run && (
            <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
              <div className="p-3 bg-[#FFDE00] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-[#111827]">
                    ⛺ 深度 {run.depth} · 矿前补给商店
                  </h2>
                  <button
                    onClick={handleRefreshShop}
                    className="px-2.5 py-1 bg-white hover:bg-gray-100 border-2 border-[#111827] rounded-lg text-xs font-mono-num text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    刷新 (
                    {run.characterId === 'jack' && !run.jackFreeRerollUsed ? '免费' : '40G'}
                    )
                  </button>
                </div>
                <p className="text-[11px] font-bold text-[#111827]">
                  可用金币：<span className="font-mono-num font-extrabold">{getSpendableGold(run)}G</span> · 本层累计达标线：{' '}
                  <span className="underline font-extrabold">{getCurrentTargetGold(run)}G</span>
                </p>
              </div>

              {/* Next Stage Biome & Weather Preview */}
              <div className="my-2 p-2.5 bg-white border-3 border-[#111827] rounded-xl shadow-[3px_3px_0px_#111827] text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#111827] font-extrabold">
                    前方矿区：【{run.currentBiome.name}】
                  </span>
                  <span className="text-[#111827] bg-[#38BDF8] border border-[#111827] px-2 py-0.2 rounded font-extrabold">
                    天气：【{run.finalWeather.name}】
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-[#4B5563]">
                  {run.finalWeather.desc}
                </p>
              </div>

              {/* 5 Fixed Shop Offers (3 Consumables + 2 Equipment) */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {shopOffers.map((offer, idx) => {
                  const finalPrice = Math.round(
                    offer.item.price * (run.characterId === 'jack' ? 0.85 : 1.0)
                  );
                  const canAfford = getSpendableGold(run) >= finalPrice;
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border-3 border-[#111827] flex items-center justify-between gap-2.5 shadow-[3px_3px_0px_#111827] ${
                        offer.purchased ? 'bg-gray-100 opacity-60' : 'bg-white'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded border border-[#111827] font-extrabold ${
                              offer.item.type === 'equipment'
                                ? 'bg-[#38BDF8] text-[#111827]'
                                : 'bg-[#4ADE80] text-[#111827]'
                            }`}
                          >
                            {offer.item.type === 'equipment' ? '被动装备' : '消耗品'}
                          </span>
                          <span className="text-xs font-extrabold text-[#111827]">
                            {offer.item.name}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-[#4B5563]">
                          {offer.item.desc}
                        </p>
                      </div>

                      <button
                        disabled={offer.purchased || !canAfford}
                        onClick={() => handleBuyShopItem(idx)}
                        className={`px-3 py-2 rounded-lg border-2 border-[#111827] text-xs font-mono-num font-extrabold whitespace-nowrap shrink-0 ${
                          offer.purchased
                            ? 'bg-gray-200 text-gray-500'
                            : canAfford
                            ? 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                            : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {offer.purchased ? '已售罄' : `${finalPrice} G`}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={enterMiningFromShop}
                className="w-full mt-2 py-3.5 bg-[#4ADE80] hover:bg-[#22C55E] text-[#111827] border-3 border-[#111827] text-sm font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
              >
                ⛏️ 进入矿区开挖 (限时 {GAME_CONFIG.NORMAL_FLOOR_TIME_SEC} 秒)
              </button>
            </div>
          )}

          {/* 5. ACTIVE MINING STAGE */}
          {view === 'mining' && run && (
            <MineCanvas
              run={run}
              costume={currentCostume}
              character={currentCharacter}
              isPaused={isPaused}
              onUpdateRun={(updater) => setRun((prev) => (prev ? updater(prev) : null))}
              onStageEnd={handleStageEnd}
              onDiscoverResource={(subId) => {
                updateSave((prev) => ({
                  ...prev,
                  discoveredResources: prev.discoveredResources.includes(subId)
                    ? prev.discoveredResources
                    : [...prev.discoveredResources, subId],
                }));
              }}
              triggerCarryDynamiteRef={triggerCarryDynamiteRef}
              activeBuffs={activeBuffs}
              onConsumeMagnet={() =>
                setActiveBuffs((prev) => ({ ...prev, magnetActive: false }))
              }
              timeRemaining={timeRemaining}
              setTimeRemaining={setTimeRemaining}
            />
          )}

          {/* 6. SPECIAL NODE VIEW (All 18 Special Nodes) */}
          {view === 'special_node' && run && (
            <SpecialNodeView
              run={run}
              setRun={setRun}
              blackMarketStock={blackMarketStock}
              setBlackMarketStock={setBlackMarketStock}
              chestRewardGold={chestRewardGold}
              onFinishSpecialNode={proceedToRouteSelect}
              onTriggerFailure={triggerFailure}
              showToast={showToast}
            />
          )}

          {/* 7. STAGE CLEAR — EXTRACT OR CONTINUE DECISION */}
          {view === 'stage_clear' && run && (
            <div className="flex-1 flex flex-col justify-between p-5 bg-[#FFFDF7] memphis-dots">
              <div className="my-auto p-5 bg-white border-3 border-[#111827] rounded-2xl space-y-4 text-center shadow-[5px_5px_0px_#111827]">
                <div className="inline-block px-3 py-1 rounded-full bg-[#4ADE80] border-2 border-[#111827] text-[#111827] text-xs font-extrabold shadow-[2px_2px_0px_#111827]">
                  {run.isTutorial
                    ? '🎓 新手教学目标完成！'
                    : run.currentNodeType === 'NODE_REWARD_MINE'
                    ? '💎 奖励矿床采集完毕！'
                    : run.currentNodeType === 'NODE_COLLAPSE'
                    ? '🪨 塌方层结算完成！'
                    : '🎉 本层累计金币目标达成！'}
                </div>

                <h2 className="text-xl font-extrabold text-[#111827]">
                  深度 {run.depth} 结算通过
                </h2>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 bg-[#FEF9C3] border-2 border-[#111827] rounded-xl shadow-[2px_2px_0px_#111827]">
                    <div className="font-bold text-[#4B5563]">本层净抓获</div>
                    <div className="text-base font-mono-num font-extrabold text-[#D97706]">
                      +{run.lastFloorEarnedGold} G
                    </div>
                  </div>
                  <div className="p-3 bg-[#DCFCE7] border-2 border-[#111827] rounded-xl shadow-[2px_2px_0px_#111827]">
                    <div className="font-bold text-[#4B5563]">可带回净金币</div>
                    <div className="text-base font-mono-num font-extrabold text-[#059669]">
                      {getSpendableGold(run)} G
                    </div>
                  </div>
                </div>

                <p className="text-xs font-bold text-[#374151] leading-relaxed">
                  现在你可以选择【主动安全撤离】将{' '}
                  <span className="text-[#D97706] font-extrabold">{getSpendableGold(run)}G</span> 100% 存入永久金库；或【继续深入】挑战更高深度！
                </p>

                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={() => proceedToRouteSelect(1)}
                    className="w-full py-3.5 bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] border-3 border-[#111827] text-sm font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    ⛏️ 继续深入下一层 (三选一路线)
                  </button>
                  <button
                    onClick={triggerVoluntaryExtraction}
                    className="w-full py-3 bg-[#4ADE80] hover:bg-[#22C55E] text-[#111827] border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    🚁 主动安全撤离 (带回 100% 收益：{getSpendableGold(run)}G)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 8. THREE-CHOICE ROUTE SELECTION SCREEN (Memphis Style + Lucky Nail & Dice) */}
          {view === 'route_select' && run && (
            <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
              <div className="p-3 bg-[#FFDE00] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-[#111827]">
                    🧭 选择深度 {run.depth + 1} 前进路线
                  </h2>
                  <p className="text-[11px] font-bold text-[#111827]/80">
                    {(run.depth + 1) % 30 === 0
                      ? '前方为 30 倍数深度：固定进入【奖励矿床 + 存档层】'
                      : (run.depth + 1) % 10 === 0
                      ? '前方为 10 倍数深度：固定进入【中继存档层】'
                      : `当前模式：${
                          GAME_CONFIG.DIFFICULTY_MODES.find((d) => d.id === run.difficultyMode)?.name
                        } · 谨慎抉择矿道`}
                  </p>
                </div>

                {/* Lucky Nail & Lucky Dice Quick Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {run.luckyDiceOwned > 0 && run.luckyDiceUsedTotal < 10 && (
                    <button
                      onClick={() => {
                        SoundFX.buyItem();
                        const nextUsed = run.luckyDiceUsedTotal + 1;
                        const rerollRng = new RandomSystem(
                          `${run.runSeed}::route-d${run.depth + 1}-dice-${nextUsed}-${Date.now()}`
                        );
                        setRouteOptions(
                          RouteSystem.generateRouteOptions(
                            rerollRng,
                            run.depth + 1,
                            false,
                            run.difficultyMode
                          )
                        );
                        setRun((prev) =>
                          prev
                            ? {
                                ...prev,
                                luckyDiceOwned: prev.luckyDiceOwned - 1,
                                luckyDiceUsedTotal: nextUsed,
                              }
                            : null
                        );
                        showToast(`🎲 投掷幸运骰重随了 3 条路线！(已用 ${nextUsed}/10 次)`);
                      }}
                      className="px-2 py-1 bg-[#38BDF8] border-2 border-[#111827] rounded-lg text-[11px] font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer"
                    >
                      🎲重随({run.luckyDiceOwned})
                    </button>
                  )}
                  {run.luckyNails > 0 && (
                    <button
                      onClick={() => {
                        SoundFX.buyItem();
                        setRouteOptions((prev) =>
                          prev.map((opt, idx) =>
                            idx === 0
                              ? {
                                  ...opt,
                                  type: 'NODE_CHEST',
                                  title: '📌 幸运钉改造：宝箱层',
                                  flavorText: '道路尽头有一只沉重旧宝箱。',
                                  subtitle: '由幸运钉定向锁定的高收益宝箱层（100~200G）',
                                  categoryBadge: '幸运钉定向改造',
                                }
                              : opt
                          )
                        );
                        setRun((prev) =>
                          prev ? { ...prev, luckyNails: prev.luckyNails - 1 } : null
                        );
                        showToast('📌 使用 1 根幸运钉，将第 1 条路线改造成【宝箱层】！');
                      }}
                      className="px-2 py-1 bg-[#4ADE80] border-2 border-[#111827] rounded-lg text-[11px] font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer"
                    >
                      📌钉宝箱({run.luckyNails})
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
                {routeOptions.map((opt, idx) => {
                  const cardColors = [
                    'bg-white hover:bg-[#FEF9C3]',
                    'bg-white hover:bg-[#E0F2FE]',
                    'bg-white hover:bg-[#DCFCE7]',
                  ];
                  return (
                    <div
                      key={opt.id}
                      onClick={() => selectRouteNode(opt)}
                      className={`p-3.5 ${cardColors[idx % 3]} border-3 border-[#111827] rounded-xl transition-all cursor-pointer space-y-1.5 shadow-[4px_4px_0px_#111827]`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-[#111827]">
                          {opt.title}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-lg border-2 border-[#111827] font-extrabold ${
                            opt.type === 'NODE_NORMAL'
                              ? 'bg-[#FFDE00] text-[#111827]'
                              : opt.type === 'NODE_REWARD_MINE' || opt.type === 'NODE_CHECKPOINT'
                              ? 'bg-[#38BDF8] text-[#111827]'
                              : 'bg-[#C084FC] text-[#111827]'
                          }`}
                        >
                          {opt.categoryBadge ||
                            (opt.type === 'NODE_NORMAL' ? '需判金币目标' : '特殊层·不判目标')}
                        </span>
                      </div>

                      <p className="text-xs font-extrabold text-[#059669]">{opt.subtitle}</p>
                      <p className="text-xs font-semibold text-[#4B5563] italic">
                        “{opt.flavorText}”
                      </p>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={triggerVoluntaryExtraction}
                className="w-full py-3 bg-[#4ADE80] hover:bg-[#22C55E] border-3 border-[#111827] text-[#111827] text-xs font-extrabold rounded-xl shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
              >
                🚁 不再深入，立即安全撤离 ({getSpendableGold(run)} G)
              </button>
            </div>
          )}

          {/* 9. VOLUNTARY EXTRACTION SUMMARY */}
          {view === 'extract_summary' && run && (
            <div className="flex-1 flex flex-col justify-between p-5 bg-[#FFFDF7] memphis-dots">
              <div className="my-auto p-5 bg-[#DCFCE7] border-3 border-[#111827] rounded-2xl text-center space-y-4 shadow-[6px_6px_0px_#111827]">
                <div className="inline-block px-3 py-1 bg-[#4ADE80] border-2 border-[#111827] rounded-full text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827]">
                  🚁 主动撤离成功
                </div>
                <h2 className="text-2xl font-extrabold text-[#111827]">满载而归！</h2>
                <p className="text-xs font-bold text-[#374151]">
                  你成功从深度 {run.depth} 安全撤回地面，所有净收益金币与黑市服装碎片已永久入库！
                </p>

                <div className="p-3.5 bg-white border-2 border-[#111827] rounded-xl space-y-2 text-xs shadow-[3px_3px_0px_#111827]">
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">到达最大深度</span>
                    <span className="font-mono-num font-extrabold text-[#111827]">
                      深度 {run.depth}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">100% 带回永久金币</span>
                    <span className="font-mono-num font-extrabold text-[#D97706]">
                      +{ getSpendableGold(run) } G
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">入库黑市服装碎片</span>
                    <span className="font-mono-num font-extrabold text-[#7E22CE]">
                      {Object.values(run.pendingShards).reduce((a, b) => a + b, 0)} 片
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setRun(null);
                    setView('title');
                  }}
                  className="w-full py-3.5 bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] border-3 border-[#111827] font-extrabold text-sm rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
                >
                  返回营地主菜单
                </button>
              </div>
            </div>
          )}

          {/* 10. FAILURE SUMMARY */}
          {view === 'fail_summary' && run && (
            <div className="flex-1 flex flex-col justify-between p-5 bg-[#FFFDF7] memphis-dots">
              <div className="my-auto p-5 bg-[#FEE2E2] border-3 border-[#111827] rounded-2xl text-center space-y-4 shadow-[6px_6px_0px_#111827]">
                <div className="inline-block px-3 py-1 bg-[#FF6B6B] text-white border-2 border-[#111827] rounded-full text-xs font-extrabold shadow-[2px_2px_0px_#111827]">
                  ⚠️ 深入探险受挫
                </div>
                <h2 className="text-xl font-extrabold text-[#111827]">
                  {run.hp <= 0 ? '矿工生命值耗尽' : '未能达成本层累计金币目标'}
                </h2>

                <div className="p-3.5 bg-white border-2 border-[#111827] rounded-xl space-y-1.5 text-xs shadow-[3px_3px_0px_#111827]">
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">受挫深度</span>
                    <span className="font-mono-num font-extrabold text-[#111827]">
                      深度 {run.depth} (普通层 #{run.normalFloorCount})
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">本局累计 / 目标金币</span>
                    <span className="font-mono-num font-extrabold text-[#D97706]">
                      {run.totalEarnedGold}G / {getCurrentTargetGold(run)}G
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-[#4B5563]">
                      直接结算可带回 ({run.contractSigned ? '契约惩罚0%' : '30%'})
                    </span>
                    <span className="font-mono-num font-extrabold text-[#059669]">
                      +{run.contractSigned ? 0 : Math.floor(getSpendableGold(run) * 0.3)} G
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {run.checkpoint && (
                    <button
                      onClick={handleResumeCheckpoint}
                      className="w-full py-3.5 bg-[#38BDF8] hover:bg-[#0EA5E9] text-[#111827] border-3 border-[#111827] font-extrabold text-xs rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
                    >
                      💾 返回深度 {run.checkpoint.depth} 存档点继续 (恢复存档累计 {run.checkpoint.totalEarnedGold}G)
                    </button>
                  )}

                  <button
                    onClick={handleFailureSettle}
                    className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] border-3 border-[#111827] font-extrabold text-xs rounded-xl shadow-[3px_3px_0px_#111827] whitespace-nowrap cursor-pointer"
                  >
                    💰 直接结算返回营地 (未入库黑市碎片丢失)
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ===================================================================
            BOTTOM EQUIPMENT & CONSUMABLES DOCK (Memphis Style)
        =================================================================== */}
        {run &&
          (view === 'mining' ||
            view === 'shop' ||
            view === 'stage_clear' ||
            view === 'route_select' ||
            view === 'special_node') && (
            <footer className="w-full bg-[#FFFDF7] border-t-3 border-[#111827] px-3 py-2 shrink-0 space-y-1.5">
              {/* Passive Equipment Row */}
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  <span className="text-[#111827] font-extrabold shrink-0">装备:</span>
                  {run.equipmentIds.length === 0 ? (
                    <span className="text-[#6B7280] font-semibold">暂无被动装备</span>
                  ) : (
                    run.equipmentIds.map((eqId) => {
                      const item = GAME_CONFIG.ITEMS.find((i) => i.id === eqId);
                      return (
                        <span
                          key={eqId}
                          className="px-1.5 py-0.5 bg-[#38BDF8] border border-[#111827] rounded text-[#111827] font-extrabold whitespace-nowrap"
                          title={item?.desc}
                        >
                          {item?.name || eqId}
                        </span>
                      );
                    })
                  )}
                </div>
                <span className="text-[#111827] bg-[#FFDE00] border border-[#111827] px-1.5 py-0.2 rounded font-extrabold shrink-0 ml-2">
                  {currentCharacter.name}
                </span>
              </div>

              {/* Active Consumables Row */}
              <div className="grid grid-cols-6 gap-1">
                {(
                  [
                    'con_dynamite',
                    'con_medkit',
                    'con_overclock',
                    'con_flare',
                    'con_magnet',
                    'con_hourglass',
                  ] as const
                ).map((cid) => {
                  const item = GAME_CONFIG.ITEMS.find((i) => i.id === cid)!;
                  const count = run.consumableIds.filter((x) => x === cid).length;
                  const canUse = view === 'mining' && count > 0 && !isPaused;
                  return (
                    <button
                      key={cid}
                      disabled={!canUse}
                      onClick={() => handleUseConsumable(cid)}
                      title={item.desc}
                      className={`py-1 px-1 rounded-lg border-2 border-[#111827] text-[10px] flex flex-col items-center justify-center transition-all ${
                        canUse
                          ? 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer'
                          : 'bg-gray-100 text-gray-400 font-bold'
                      }`}
                    >
                      <span className="truncate max-w-full">{item.name.slice(0, 2)}</span>
                      <span className="font-mono-num font-extrabold">×{count}</span>
                    </button>
                  );
                })}
              </div>
            </footer>
          )}

        {/* ===================================================================
            FLOATING DEBUG / TESTING PANEL OVERLAY (Section 34)
        =================================================================== */}
        {debugOpen && (
          <div className="absolute inset-x-3 top-14 bottom-16 z-50 bg-[#FFFDF7] border-4 border-[#111827] rounded-2xl p-4 flex flex-col justify-between shadow-[8px_8px_0px_#111827] overflow-hidden">
            <div className="overflow-y-auto pr-1 flex-1">
              <DebugPanelContent
                run={run}
                setRun={setRun}
                saveData={saveData}
                updateSave={updateSave}
                onForceExtract={triggerVoluntaryExtraction}
                onForceFail={triggerFailure}
                onNextDepth={() => {
                  if (!run) {
                    showToast('请先开始一局探险！');
                    return;
                  }
                  proceedToRouteSelect(1);
                }}
                onForceNode={(nodeType: RouteNodeType) => {
                  if (!run) {
                    showToast('请先进入一局探险！');
                    return;
                  }
                  setDebugOpen(false);
                  selectRouteNode({
                    id: `debug-${nodeType}-${Date.now()}`,
                    type: nodeType,
                    title: `Debug ${nodeType}`,
                    flavorText: '调试面板强制进入节点',
                    subtitle: 'Debug 强制进入节点',
                  });
                }}
                showToast={showToast}
              />
            </div>
            <button
              onClick={() => setDebugOpen(false)}
              className="w-full mt-3 py-2.5 bg-[#111827] text-[#FFDE00] text-xs font-extrabold rounded-xl whitespace-nowrap cursor-pointer"
            >
              关闭调试面板 (快捷键 D)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
