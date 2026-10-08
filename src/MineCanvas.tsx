import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  GAME_CONFIG,
  CostumeConfig,
  CharacterConfig,
} from './gameConfig';
import {
  RunState,
  MineResourceEntity,
  MineObstacleEntity,
  ResourceSystem,
  ObstacleSystem,
  RandomSystem,
} from './systems';
import { SoundFX } from './sound';

export interface FloatingTextEffect {
  id: number;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  isGoldFlyIn?: boolean;
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

interface LightningBolt {
  points: { x: number; y: number }[];
  alpha: number;
  color: string;
}

interface MineCanvasProps {
  run: RunState;
  costume: CostumeConfig;
  character: CharacterConfig;
  isPaused: boolean;
  onUpdateRun: (updater: (prev: RunState) => RunState) => void;
  onStageEnd: (reason: 'time_up' | 'all_cleared' | 'hp_zero' | 'tutorial_done') => void;
  onDiscoverResource: (subTypeId: string) => void;
  triggerCarryDynamiteRef: React.MutableRefObject<(() => boolean) | null>;
  activeBuffs: {
    overclockSec: number;
    flareSec: number;
    magnetActive: boolean;
  };
  onConsumeMagnet: () => void;
  timeRemaining: number;
  setTimeRemaining: React.Dispatch<React.SetStateAction<number>>;
}

export const MineCanvas: React.FC<MineCanvasProps> = ({
  run,
  costume,
  character,
  isPaused,
  onUpdateRun,
  onStageEnd,
  onDiscoverResource,
  triggerCarryDynamiteRef,
  activeBuffs,
  onConsumeMagnet,
  timeRemaining,
  setTimeRemaining,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [grabPulse, setGrabPulse] = useState<'none' | 'pop' | 'heavy'>('none');
  const [hitJolt, setHitJolt] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);
  const [weatherBanner, setWeatherBanner] = useState<string | null>(null);
  const [aimPreview, setAimPreview] = useState<{
    name: string;
    tier: string;
    priceText: string;
    weightLevel: number;
    estSec: number;
    isObstacle?: boolean;
    damage?: number;
    obsHp?: number;
    obsMaxHp?: number;
  } | null>(null);

  // Mutable game world state inside ref for 60fps requestAnimationFrame loop
  const worldRef = useRef<{
    resources: MineResourceEntity[];
    obstacles: MineObstacleEntity[];
    hookState: 'swinging' | 'shooting' | 'retracting';
    hookAngle: number; // Radians from vertical down (0 = straight down, - is left, + is right)
    hookDir: 1 | -1;
    hookLength: number;
    grabbedRes: MineResourceEntity | null;
    obstaclePenaltyActive: boolean;
    noahOverloadReady: boolean;
    hitStopTimer: number;
    shockwaves: {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      color: string;
      isJagged?: boolean;
      life: number;
      maxLife: number;
    }[];
    particles: { x: number; y: number; vx: number; vy: number; color: string; life: number; maxLife: number; radius: number }[];
    floatingTexts: FloatingTextEffect[];
    weatherParticles: WeatherParticle[];
    lightningBolts: LightningBolt[];
    periodicTimer: number;
    tutorialWeatherSwitched: boolean;
    stageEnded: boolean;
    pauseApexTimer: number;
  }>({
    resources: [],
    obstacles: [],
    hookState: 'swinging',
    hookAngle: 0,
    hookDir: 1,
    hookLength: 26,
    grabbedRes: null,
    obstaclePenaltyActive: false,
    noahOverloadReady: false,
    hitStopTimer: 0,
    shockwaves: [],
    particles: [],
    floatingTexts: [],
    weatherParticles: [],
    lightningBolts: [],
    periodicTimer: 0,
    tutorialWeatherSwitched: false,
    stageEnded: false,
    pauseApexTimer: 0,
  });

  // Initialize entities when depth/stage changes
  useEffect(() => {
    const stageRng = new RandomSystem(`${run.runSeed}::depth-${run.depth}::floor-${run.normalFloorCount}`);
    const isBonusBed = run.currentNodeType === 'NODE_REWARD_MINE';
    const resources = ResourceSystem.generateStageResources(stageRng, run, isBonusBed);
    const obstacles = ObstacleSystem.generateStageObstacles(stageRng, run, resources, isBonusBed);

    // Initialize weather particles
    const wParticles: WeatherParticle[] = [];
    for (let i = 0; i < 48; i++) {
      wParticles.push({
        x: Math.random() * GAME_CONFIG.CANVAS_WIDTH,
        y: Math.random() * GAME_CONFIG.CANVAS_HEIGHT,
        vx: (Math.random() - 0.5) * 30,
        vy: 60 + Math.random() * 90,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.25 + Math.random() * 0.55,
      });
    }

    worldRef.current = {
      resources,
      obstacles,
      hookState: 'swinging',
      hookAngle: 0,
      hookDir: 1,
      hookLength: 26,
      grabbedRes: null,
      obstaclePenaltyActive: false,
      noahOverloadReady: run.characterId === 'noah' && run.noahComboCount >= 3,
      hitStopTimer: 0,
      shockwaves: [],
      particles: [],
      floatingTexts: [],
      weatherParticles: wParticles,
      lightningBolts: [],
      periodicTimer: 0,
      tutorialWeatherSwitched: false,
      stageEnded: false,
      pauseApexTimer: 0,
    };

    if (run.finalWeather.isSpecialCombo) {
      setWeatherBanner(`⚡ 触发天气联动：【${run.finalWeather.name}】`);
      const timer = setTimeout(() => setWeatherBanner(null), 4000);
      return () => clearTimeout(timer);
    } else if (run.equipmentIds.includes('eq_weather_meter')) {
      setWeatherBanner(`📡 气象仪播报：当前基础天气【${run.baseWeather.name}】，无特殊联动`);
      const timer = setTimeout(() => setWeatherBanner(null), 3500);
      return () => clearTimeout(timer);
    } else {
      setWeatherBanner(null);
    }
  }, [run.depth, run.normalFloorCount, run.currentNodeType, run.runSeed]);

  // Spawn burst particles helper
  const spawnBurst = useCallback((x: number, y: number, color: string, count = 14) => {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 40 + Math.random() * 110;
      worldRef.current.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        radius: 2 + Math.random() * 2.5,
      });
    }
  }, []);

  const addFloatingText = useCallback(
    (x: number, y: number, text: string, color: string, isGoldFlyIn = false) => {
      worldRef.current.floatingTexts.push({
        id: Math.random(),
        x,
        y,
        targetX: isGoldFlyIn ? 130 : undefined,
        targetY: isGoldFlyIn ? 18 : undefined,
        text,
        color,
        life: 0,
        maxLife: isGoldFlyIn ? 0.75 : 0.95,
        isGoldFlyIn,
      });
    },
    []
  );

  // Distinct tactile feedback 1: Juicy spring pop + shockwave ring when grabbing an ore
  const triggerGrabFeedback = useCallback(
    (isHeavy: boolean, isSpecial: boolean, color: string, x: number, y: number) => {
      SoundFX.grab(isHeavy, isSpecial);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(isSpecial ? [18, 20, 30] : 22);
      }
      worldRef.current.hitStopTimer = isSpecial || isHeavy ? 0.075 : 0.045;
      worldRef.current.shockwaves.push({
        x,
        y,
        radius: 8,
        maxRadius: isSpecial ? 58 : isHeavy ? 48 : 38,
        color,
        isJagged: false,
        life: 0,
        maxLife: 0.28,
      });
      setGrabPulse(isSpecial || isHeavy ? 'heavy' : 'pop');
      setTimeout(() => setGrabPulse('none'), 240);
    },
    []
  );

  // Distinct tactile feedback 2: Harsh horizontal rock/obstacle jolt + red vignette
  const triggerDamageFeedback = useCallback((isShatter = false, x?: number, y?: number) => {
    SoundFX.hitObstacle(isShatter);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(isShatter ? [45, 25, 70] : [35, 20, 45]);
    }
    worldRef.current.hitStopTimer = isShatter ? 0.08 : 0.055;
    if (x !== undefined && y !== undefined) {
      worldRef.current.shockwaves.push({
        x,
        y,
        radius: 10,
        maxRadius: isShatter ? 64 : 44,
        color: isShatter ? '#FACC15' : '#EF4444',
        isJagged: true,
        life: 0,
        maxLife: 0.32,
      });
    }
    setHitJolt(true);
    setDamageFlash(true);
    setTimeout(() => setHitJolt(false), 320);
    setTimeout(() => setDamageFlash(false), 220);
  }, []);

  // Expose Dynamite consumable action to parent
  useEffect(() => {
    triggerCarryDynamiteRef.current = () => {
      const w = worldRef.current;
      // 1. If currently retracting a heavy resource, blow it up and retract immediately
      if (w.hookState === 'retracting' && w.grabbedRes) {
        const rx = w.grabbedRes.x;
        const ry = w.grabbedRes.y;
        w.grabbedRes.collected = true;
        w.grabbedRes.grabbed = false;
        w.grabbedRes = null;
        w.obstaclePenaltyActive = false;
        spawnBurst(rx, ry, '#EF4444', 20);
        addFloatingText(rx, ry, '💥 炸毁重物！轻装回收', '#F87171');
        SoundFX.hitObstacle();
        return true;
      }
      // 2. Otherwise destroy up to 2 active obstacles on screen
      const activeObs = w.obstacles.filter((o) => !o.destroyed);
      if (activeObs.length > 0) {
        activeObs.slice(0, 2).forEach((obs) => {
          obs.destroyed = true;
          spawnBurst(obs.x, obs.y, '#F97316', 18);
          addFloatingText(obs.x, obs.y, '💥 障碍清除！', '#FBBF24');
        });
        SoundFX.hitObstacle();
        return true;
      }
      return false;
    };
  }, [triggerCarryDynamiteRef, spawnBurst, addFloatingText]);

  // Shoot hook action
  const handleShootHook = useCallback(() => {
    if (isPaused || worldRef.current.stageEnded) return;
    if (worldRef.current.hookState === 'swinging') {
      worldRef.current.hookState = 'shooting';
      worldRef.current.obstaclePenaltyActive = false;
      SoundFX.shoot();
    }
  }, [isPaused]);

  // Keyboard Space to shoot
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        // Avoid triggering if focused on an input
        if (document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        handleShootHook();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleShootHook]);

  // Countdown timer effect (1s interval)
  useEffect(() => {
    if (isPaused || worldRef.current.stageEnded) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (!worldRef.current.stageEnded) {
            worldRef.current.stageEnded = true;
            setTimeout(() => onStageEnd('time_up'), 60);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused, onStageEnd, setTimeRemaining]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const updateAndDraw = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = worldRef.current;
      const minerX = GAME_CONFIG.CANVAS_WIDTH / 2;
      const minerY = GAME_CONFIG.MINER_Y;

      if (!isPaused && !w.stageEnded) {
        // 1. Check Tutorial weather switch (Sunny -> Rain after 2 grabs or 40s)
        if (
          run.isTutorial &&
          !w.tutorialWeatherSwitched &&
          (run.tutorialGrabs >= 2 || timeRemaining <= 55)
        ) {
          w.tutorialWeatherSwitched = true;
          const rainWeather = GAME_CONFIG.BASE_WEATHERS.find((bw) => bw.id === 'rain')!;
          onUpdateRun((prev) => ({
            ...prev,
            baseWeather: rainWeather,
            finalWeather: rainWeather,
          }));
          setWeatherBanner('🌧️ 教学演练：天气由【晴天】转为【雨天】！观察摆幅与回收变化');
          setTimeout(() => setWeatherBanner(null), 4000);
        }

        // 2. Periodic Weather Events (Thunderstorm / Hail / Meteor / Miasma / Electric Fire)
        const intervalSec = run.finalWeather.periodicIntervalSec;
        if (intervalSec && intervalSec > 0) {
          w.periodicTimer += dt;
          if (w.periodicTimer >= intervalSec) {
            w.periodicTimer = 0;
            const pType = run.finalWeather.periodicType;
            SoundFX.weatherShock();

            if (pType === 'thunder' || pType === 'arc') {
              // 50% destroy obstacle, 30% expose new ore, 20% nothing
              const roll = Math.random();
              const activeObs = w.obstacles.filter((o) => !o.destroyed);
              if ((roll < 0.5 || run.finalWeather.id === 'combo_thunder_vein') && activeObs.length > 0) {
                const target = activeObs[Math.floor(Math.random() * activeObs.length)];
                target.destroyed = true;
                w.lightningBolts.push({
                  points: [
                    { x: target.x + (Math.random() - 0.5) * 60, y: 0 },
                    { x: target.x - 18, y: target.y * 0.45 },
                    { x: target.x + 14, y: target.y * 0.75 },
                    { x: target.x, y: target.y },
                  ],
                  alpha: 1.0,
                  color: '#FDE047',
                });
                spawnBurst(target.x, target.y, '#FDE047', 18);
                addFloatingText(target.x, target.y, '⚡ 雷击粉碎障碍！', '#FDE047');
              } else if (roll < 0.8 || run.finalWeather.id === 'combo_thunder_vein') {
                // Expose bonus ore!
                const rx = 65 + Math.random() * (GAME_CONFIG.CANVAS_WIDTH - 130);
                const ry = 230 + Math.random() * 280;
                const sub = GAME_CONFIG.RESOURCE_SUBTYPES.find((s) => s.id === 'r3_iron')!;
                w.resources.push({
                  uid: `thunder-ore-${Date.now()}`,
                  subType: sub,
                  tier: 'R3',
                  displayName: '雷击富矿',
                  x: rx,
                  y: ry,
                  radius: sub.radius,
                  weightLevel: sub.weightLevel,
                  basePrice: 55,
                  revealedPrice: true,
                  grabbed: false,
                  collected: false,
                  pulsePhase: 0,
                });
                w.lightningBolts.push({
                  points: [
                    { x: rx, y: 0 },
                    { x: rx + 20, y: ry * 0.5 },
                    { x: rx, y: ry },
                  ],
                  alpha: 1.0,
                  color: '#38BDF8',
                });
                spawnBurst(rx, ry, '#38BDF8', 16);
                addFloatingText(rx, ry, '⚡ 雷暴暴露新矿！', '#38BDF8');
              } else {
                addFloatingText(minerX, minerY + 40, '⚡ 惊雷掠过（无事发生）', '#94A3B8');
              }
            } else if (pType === 'meteor') {
              // Meteor impact: destroys obstacle or drops star ore
              const rx = 70 + Math.random() * (GAME_CONFIG.CANVAS_WIDTH - 140);
              const ry = 240 + Math.random() * 270;
              w.lightningBolts.push({
                points: [
                  { x: rx - 120, y: 20 },
                  { x: rx, y: ry },
                ],
                alpha: 1.0,
                color: '#F43F5E',
              });
              spawnBurst(rx, ry, '#F43F5E', 22);
              const sub = GAME_CONFIG.RESOURCE_SUBTYPES.find((s) => s.id === 's2_void_gem')!;
              w.resources.push({
                uid: `meteor-ore-${Date.now()}`,
                subType: sub,
                tier: 'S2',
                displayName: '坠落星核',
                x: rx,
                y: ry,
                radius: sub.radius,
                weightLevel: 1,
                basePrice: 205,
                revealedPrice: true,
                grabbed: false,
                collected: false,
                pulsePhase: 0,
              });
              addFloatingText(rx, ry, '☄️ 陨石坠落：产出星核！', '#F43F5E');
            } else if (pType === 'hail' || pType === 'miasma') {
              // Deals minor periodic hazard unless character is Renn (Storm Hunter)
              if (run.characterId === 'renn') {
                addFloatingText(minerX, minerY + 36, '🛡️ 逆境狂热：免疫天气冲击', '#22D3EE');
              } else {
                const dmg = pType === 'hail' ? 4 : 4;
                onUpdateRun((prev) => {
                  const minHp = prev.isTutorial ? 1 : 0;
                  const nextHp = Math.max(minHp, prev.hp - dmg);
                  if (nextHp <= 0 && !w.stageEnded) {
                    w.stageEnded = true;
                    setTimeout(() => onStageEnd('hp_zero'), 60);
                  }
                  return { ...prev, hp: nextHp };
                });
                addFloatingText(
                  minerX,
                  minerY + 36,
                  pType === 'hail' ? `❄️ 冰雹冲击 -${dmg} HP` : `☠️ 毒瘴侵蚀 -${dmg} HP`,
                  '#F87171'
                );
              }
            }
          }
        }

        // 3. Update Moving Obstacles
        for (const obs of w.obstacles) {
          if (obs.destroyed || obs.type !== 'moving') continue;
          obs.x += obs.vx * dt;
          if (obs.x < obs.minX) {
            obs.x = obs.minX;
            obs.vx = Math.abs(obs.vx);
          } else if (obs.x > obs.maxX) {
            obs.x = obs.maxX;
            obs.vx = -Math.abs(obs.vx);
          }
        }

        // Hit-stop micro-freeze for juicy arcade impact
        const effectiveDt = w.hitStopTimer > 0 ? dt * 0.08 : dt;
        if (w.hitStopTimer > 0) {
          w.hitStopTimer = Math.max(0, w.hitStopTimer - dt);
        }

        // 4. Hook State Machine
        const maxDeg =
          GAME_CONFIG.BASE_SWING_AMPLITUDE_DEG *
          run.finalWeather.swingRangeMult *
          (run.equipmentIds.includes('eq_stabilizer') ? 0.78 : 1.0) *
          (run.equipmentIds.includes('eq_multi_winch') ? 0.95 : 1.0) *
          (run.characterId === 'barton' ? 0.82 : 1.0);
        const maxRad = (Math.min(82, maxDeg) * Math.PI) / 180;

        if (w.hookState === 'swinging') {
          w.hookLength = 26;
          if (w.pauseApexTimer > 0) {
            w.pauseApexTimer -= effectiveDt;
          } else {
            w.hookAngle += w.hookDir * GAME_CONFIG.BASE_SWING_SPEED_RAD * effectiveDt;
            if (w.hookAngle >= maxRad) {
              w.hookAngle = maxRad;
              w.hookDir = -1;
              if (run.characterId === 'barton') w.pauseApexTimer = 0.14;
            } else if (w.hookAngle <= -maxRad) {
              w.hookAngle = -maxRad;
              w.hookDir = 1;
              if (run.characterId === 'barton') w.pauseApexTimer = 0.14;
            }
          }
        } else if (w.hookState === 'shooting') {
          let shootSpeed =
            GAME_CONFIG.BASE_SHOOT_SPEED *
            run.finalWeather.shootSpeedMult *
            (run.equipmentIds.includes('eq_light_claw') ? 1.30 : 1.0) *
            (run.equipmentIds.includes('eq_multi_winch') ? 1.10 : 1.0);

          if (w.noahOverloadReady) shootSpeed *= 1.85;
          if (activeBuffs.overclockSec > 0) shootSpeed *= 1.65;

          w.hookLength += shootSpeed * effectiveDt;

          const hx = minerX + Math.sin(w.hookAngle) * w.hookLength;
          const hy = minerY + Math.cos(w.hookAngle) * w.hookLength;

          // Check boundary rock wall
          if (
            hx < 16 ||
            hx > GAME_CONFIG.CANVAS_WIDTH - 16 ||
            hy > GAME_CONFIG.CANVAS_HEIGHT - 16 ||
            w.hookLength >= GAME_CONFIG.HOOK_MAX_LENGTH
          ) {
            w.hookState = 'retracting';
            // Subtle rock wall clink feedback (distinct from ore grab)
            spawnBurst(hx, hy, '#94A3B8', 7);
            w.shockwaves.push({
              x: hx,
              y: hy,
              radius: 5,
              maxRadius: 24,
              color: '#94A3B8',
              isJagged: true,
              life: 0,
              maxLife: 0.2,
            });
            setHitJolt(true);
            setTimeout(() => setHitJolt(false), 160);
          } else {
            // Check collision with Obstacles first
            for (const obs of w.obstacles) {
              if (obs.destroyed) continue;
              const dist = Math.hypot(obs.x - hx, obs.y - hy);
              if (dist <= obs.radius + GAME_CONFIG.HOOK_RADIUS) {
                // Hit obstacle!
                if (run.characterId === 'lena' && obs.type === 'static') {
                  // Lena passive: immunity & shatter static obstacle + 45% chance +28G
                  obs.hp = 0;
                  obs.destroyed = true;
                  spawnBurst(obs.x, obs.y, '#F59E0B', 22);
                  triggerGrabFeedback(true, true, '#F59E0B', obs.x, obs.y);
                  if (Math.random() < 0.45) {
                    onUpdateRun((prev) => ({
                      ...prev,
                      totalEarnedGold: prev.totalEarnedGold + 28,
                      lastFloorEarnedGold: prev.lastFloorEarnedGold + 28,
                    }));
                    addFloatingText(obs.x, obs.y, '💥 爆破碎矿 +28G', '#FBBF24', true);
                  } else {
                    addFloatingText(obs.x, obs.y, '💥 莉娜免伤破障！', '#34D399');
                  }
                  w.hookState = 'retracting';
                  break;
                }

                // Check Hydraulic Arm equipment & 3-Hit Destruction Rule
                const hasHydraulic = run.equipmentIds.includes('eq_home_hydraulic');
                const hasShieldVest = run.equipmentIds.includes('eq_home_shield_vest');
                let dmg = obs.baseDamage;
                if (hasHydraulic && obs.type === 'static') {
                  obs.hp = 0;
                  obs.destroyed = true;
                  dmg = Math.round(dmg * 0.5);
                } else if (obs.type === 'hazard') {
                  obs.hp = 0;
                  obs.destroyed = true;
                } else {
                  // Decrement obstacle durability (3 hits to destroy!)
                  obs.hp = Math.max(0, obs.hp - 1);
                  if (obs.hp <= 0) {
                    obs.destroyed = true;
                  }
                }

                if (hasShieldVest) dmg *= 0.7;
                if (run.curses.includes('curse_dmg_up')) dmg *= 1.1;
                if (run.fateBuffs.includes('fate_reckless')) dmg *= 1.15;
                dmg = Math.max(1, Math.round(dmg));

                const isShatteredNow = obs.destroyed;
                triggerDamageFeedback(isShatteredNow, obs.x, obs.y);
                spawnBurst(hx, hy, isShatteredNow ? '#FACC15' : '#EF4444', isShatteredNow ? 26 : 16);

                if (isShatteredNow) {
                  addFloatingText(
                    obs.x,
                    obs.y,
                    `💥 抓满销毁！${obs.name}彻底粉碎 (-${dmg}HP)`,
                    '#FACC15'
                  );
                } else {
                  addFloatingText(
                    hx,
                    hy,
                    `-${dmg}HP · ${obs.name}受损 (剩${obs.hp}次销毁)`,
                    '#F87171'
                  );
                }

                onUpdateRun((prev) => {
                  const minHp = prev.isTutorial ? 1 : 0;
                  const nextHp = Math.max(minHp, prev.hp - dmg);
                  if (nextHp <= 0 && !w.stageEnded) {
                    w.stageEnded = true;
                    setTimeout(() => onStageEnd('hp_zero'), 60);
                  }
                  return { ...prev, hp: nextHp };
                });

                w.obstaclePenaltyActive = true;
                w.hookState = 'retracting';
                break;
              }
            }

            // Check collision with Resources if still shooting
            if (w.hookState === 'shooting') {
              for (const res of w.resources) {
                if (res.collected) continue;
                const dist = Math.hypot(res.x - hx, res.y - hy);
                if (dist <= res.radius + GAME_CONFIG.HOOK_RADIUS) {
                  res.grabbed = true;
                  w.grabbedRes = res;
                  w.hookState = 'retracting';
                  const isHeavy = res.weightLevel >= 3;
                  const isSpecial = res.tier === 'S1' || res.tier === 'S2' || res.tier === 'M';
                  triggerGrabFeedback(isHeavy, isSpecial, res.subType.borderColor, res.x, res.y);
                  spawnBurst(res.x, res.y, res.subType.borderColor, isSpecial ? 18 : 12);
                  addFloatingText(
                    res.x,
                    res.y - 14,
                    `🎯 抓中 ${res.displayName}!`,
                    res.subType.borderColor
                  );
                  break;
                }
              }
            }
          }
        } else if (w.hookState === 'retracting') {
          let retractSpeed = GAME_CONFIG.BASE_EMPTY_RETRACT_SPEED;

          if (w.grabbedRes) {
            const metrics = ResourceSystem.calculateRetrievalMetrics(
              w.grabbedRes.weightLevel,
              w.grabbedRes.tier,
              w.obstaclePenaltyActive,
              run,
              activeBuffs.overclockSec > 0,
              w.noahOverloadReady
            );
            retractSpeed = metrics.pullSpeedPxPerSec;

            // Update grabbed resource position to follow hook tip
            const hx = minerX + Math.sin(w.hookAngle) * w.hookLength;
            const hy = minerY + Math.cos(w.hookAngle) * w.hookLength;
            w.grabbedRes.x = hx;
            w.grabbedRes.y = hy;

            // Check if a moving obstacle collides with our retracting resource!
            if (!w.obstaclePenaltyActive) {
              for (const obs of w.obstacles) {
                if (obs.destroyed || obs.type !== 'moving') continue;
                if (Math.hypot(obs.x - hx, obs.y - hy) <= obs.radius + w.grabbedRes.radius) {
                  w.obstaclePenaltyActive = true;
                  obs.hp = Math.max(0, obs.hp - 1);
                  if (obs.hp <= 0) {
                    obs.destroyed = true;
                  }
                  let dmg = obs.baseDamage;
                  if (run.equipmentIds.includes('eq_home_shield_vest')) dmg *= 0.7;
                  if (run.curses.includes('curse_dmg_up')) dmg *= 1.1;
                  if (run.fateBuffs.includes('fate_reckless')) dmg *= 1.15;
                  dmg = Math.max(1, Math.round(dmg));

                  triggerDamageFeedback(obs.destroyed, obs.x, obs.y);
                  addFloatingText(
                    hx,
                    hy,
                    obs.destroyed
                      ? `💥 矿车撞毁 (-${dmg}HP)`
                      : `⚠️ 矿车刮擦 -${dmg}HP (剩${obs.hp}次销毁)`,
                    '#F87171'
                  );
                  onUpdateRun((prev) => {
                    const minHp = prev.isTutorial ? 1 : 0;
                    const nextHp = Math.max(minHp, prev.hp - dmg);
                    if (nextHp <= 0 && !w.stageEnded) {
                      w.stageEnded = true;
                      setTimeout(() => onStageEnd('hp_zero'), 60);
                    }
                    return { ...prev, hp: nextHp };
                  });
                  break;
                }
              }
            }
          } else {
            if (activeBuffs.overclockSec > 0) retractSpeed *= 1.5;
          }

          w.hookLength -= retractSpeed * effectiveDt;

          if (w.hookLength <= 26) {
            w.hookLength = 26;
            w.hookState = 'swinging';

            if (w.grabbedRes) {
              const collectedRes = w.grabbedRes;
              collectedRes.collected = true;
              collectedRes.grabbed = false;
              w.grabbedRes = null;

              const finalGold = ResourceSystem.calculateFinalPrice(
                collectedRes,
                run,
                w.noahOverloadReady,
                activeBuffs.magnetActive
              );

              if (activeBuffs.magnetActive) {
                onConsumeMagnet();
              }

              SoundFX.collectGold(finalGold);
              onDiscoverResource(collectedRes.subType.id);
              spawnBurst(minerX, minerY + 20, '#FBBF24', 18);
              addFloatingText(
                minerX,
                minerY + 18,
                `+${finalGold}G (${collectedRes.displayName})`,
                '#FDE047',
                true
              );

              const nextNoahCount = run.characterId === 'noah' ? (w.noahOverloadReady ? 0 : run.noahComboCount + 1) : 0;
              w.noahOverloadReady = run.characterId === 'noah' && nextNoahCount >= 3;

              const nextTutGrabs = run.isTutorial ? run.tutorialGrabs + 1 : run.tutorialGrabs;
              const nextCollapseGrabs =
                run.currentNodeType === 'NODE_COLLAPSE'
                  ? run.collapseGrabs + 1
                  : run.collapseGrabs;

              onUpdateRun((prev) => ({
                ...prev,
                totalEarnedGold: prev.totalEarnedGold + finalGold,
                lastFloorEarnedGold: prev.lastFloorEarnedGold + finalGold,
                noahComboCount: nextNoahCount,
                tutorialGrabs: nextTutGrabs,
                collapseGrabs: nextCollapseGrabs,
              }));

              // Check tutorial target completion (5 grabs)
              if (run.isTutorial && nextTutGrabs >= GAME_CONFIG.TUTORIAL_TARGET_COUNT && !w.stageEnded) {
                w.stageEnded = true;
                setTimeout(() => onStageEnd('tutorial_done'), 450);
              }
              // Check Collapse Node completion (3 grabs within 60s)
              else if (run.currentNodeType === 'NODE_COLLAPSE' && nextCollapseGrabs >= 3 && !w.stageEnded) {
                w.stageEnded = true;
                addFloatingText(minerX, minerY + 45, '🎉 采满3处矿点！成功冲出塌方层！', '#4ADE80');
                setTimeout(() => onStageEnd('all_cleared'), 500);
              }
              // Check if all resources on stage were cleared
              else if (w.resources.every((r) => r.collected) && !w.stageEnded) {
                w.stageEnded = true;
                setTimeout(() => onStageEnd('all_cleared'), 450);
              }
            }

            w.obstaclePenaltyActive = false;
          }
        }

        // 5. Update Aim Ray Preview while swinging
        if (w.hookState === 'swinging') {
          const sinA = Math.sin(w.hookAngle);
          const cosA = Math.cos(w.hookAngle);
          let bestDist = 9999;
          let foundPreview: typeof aimPreview = null;

          // Ray-circle intersection check along hook trajectory
          for (const res of w.resources) {
            if (res.collected) continue;
            const dx = res.x - minerX;
            const dy = res.y - minerY;
            const proj = dx * sinA + dy * cosA;
            if (proj > 25 && proj < GAME_CONFIG.HOOK_MAX_LENGTH) {
              const perpDist = Math.abs(dx * cosA - dy * sinA);
              if (perpDist <= res.radius + GAME_CONFIG.HOOK_RADIUS - 2 && proj < bestDist) {
                bestDist = proj;
                const metrics = ResourceSystem.calculateRetrievalMetrics(
                  res.weightLevel,
                  res.tier,
                  false,
                  run,
                  activeBuffs.overclockSec > 0,
                  w.noahOverloadReady
                );
                const estPrice = res.revealedPrice
                  ? `${ResourceSystem.calculateFinalPrice(res, run, w.noahOverloadReady, activeBuffs.magnetActive)}G`
                  : run.equipmentIds.includes('eq_price_amulet')
                  ? '40~205G (保价)'
                  : '5~205G (盲盒)';
                foundPreview = {
                  name: res.displayName,
                  tier: res.tier,
                  priceText: estPrice,
                  weightLevel: res.weightLevel,
                  estSec: metrics.estimatedRetrievalSec,
                };
              }
            }
          }

          for (const obs of w.obstacles) {
            if (obs.destroyed) continue;
            const dx = obs.x - minerX;
            const dy = obs.y - minerY;
            const proj = dx * sinA + dy * cosA;
            if (proj > 25 && proj < bestDist) {
              const perpDist = Math.abs(dx * cosA - dy * sinA);
              if (perpDist <= obs.radius + GAME_CONFIG.HOOK_RADIUS - 2) {
                bestDist = proj;
                foundPreview = {
                  name: obs.name,
                  tier: `耐久 ${obs.hp}/${obs.maxHp}`,
                  priceText:
                    run.characterId === 'lena' && obs.type === 'static'
                      ? '可免伤爆破'
                      : `碰撞 -${obs.baseDamage}HP · 再抓${obs.hp}次彻底销毁`,
                  weightLevel: 0,
                  estSec: 0,
                  isObstacle: true,
                  damage: obs.baseDamage,
                  obsHp: obs.hp,
                  obsMaxHp: obs.maxHp,
                };
              }
            }
          }
          setAimPreview(foundPreview);
        }
      }

      // ========================================================================
      // RENDER PIPELINE
      // ========================================================================
      ctx.clearRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);

      // 1. Sky Background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_CONFIG.SOIL_TOP_Y);
      skyGrad.addColorStop(0, run.currentBiome.skyGradient[0]);
      skyGrad.addColorStop(1, run.currentBiome.skyGradient[1]);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.SOIL_TOP_Y);

      // Weather Sky Overlay Tint
      ctx.fillStyle = run.finalWeather.skyTint;
      ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.SOIL_TOP_Y);

      // Aurora / Blood Moon / Eclipse / Scorching Sun celestial graphics in sky
      if (run.finalWeather.id.includes('aurora')) {
        ctx.save();
        const waveGrad = ctx.createLinearGradient(0, 10, GAME_CONFIG.CANVAS_WIDTH, 90);
        waveGrad.addColorStop(0, 'rgba(45, 212, 191, 0.05)');
        waveGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.35)');
        waveGrad.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
        ctx.fillStyle = waveGrad;
        ctx.beginPath();
        ctx.moveTo(0, 25);
        for (let x = 0; x <= GAME_CONFIG.CANVAS_WIDTH; x += 30) {
          ctx.lineTo(x, 35 + Math.sin(now * 0.002 + x * 0.02) * 14);
        }
        ctx.lineTo(GAME_CONFIG.CANVAS_WIDTH, 95);
        ctx.lineTo(0, 95);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (run.finalWeather.id.includes('blood') || run.finalWeather.id === 'eclipse') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(370, 46, 22, 0, Math.PI * 2);
        ctx.fillStyle = run.finalWeather.id === 'eclipse' ? '#090D16' : '#DC2626';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = run.finalWeather.id === 'eclipse' ? '#F59E0B' : '#FCA5A5';
        ctx.stroke();
        ctx.restore();
      }

      // 2. Underground Soil Strata
      const soilGrad = ctx.createLinearGradient(0, GAME_CONFIG.SOIL_TOP_Y, 0, GAME_CONFIG.CANVAS_HEIGHT);
      soilGrad.addColorStop(0, run.currentBiome.soilGradient[0]);
      soilGrad.addColorStop(0.5, run.currentBiome.soilGradient[1]);
      soilGrad.addColorStop(1, run.currentBiome.soilGradient[2]);
      ctx.fillStyle = soilGrad;
      ctx.fillRect(0, GAME_CONFIG.SOIL_TOP_Y, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.SOIL_TOP_Y);

      // Subtle geological depth lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      [220, 340, 460].forEach((ly) => {
        ctx.beginPath();
        ctx.moveTo(0, ly);
        ctx.lineTo(GAME_CONFIG.CANVAS_WIDTH, ly);
        ctx.stroke();
      });

      // Top Soil Ledge / Wooden Mine Beam
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, GAME_CONFIG.SOIL_TOP_Y - 6, GAME_CONFIG.CANVAS_WIDTH, 8);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, GAME_CONFIG.SOIL_TOP_Y - 6);
      ctx.lineTo(GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.SOIL_TOP_Y - 6);
      ctx.stroke();

      // 3. Draw Miner & Winch Rig at Top Center
      ctx.save();
      ctx.translate(minerX, minerY);

      // Winch Support Frame
      ctx.fillStyle = '#334155';
      ctx.fillRect(-26, 8, 52, 10);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-26, 8, 52, 10);

      // Miner Cape
      ctx.fillStyle = costume.capeColor;
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.lineTo(-22, 6);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();

      // Miner Body Suit
      ctx.fillStyle = costume.suitColor;
      ctx.beginPath();
      ctx.roundRect(-12, -20, 24, 26, 5);
      ctx.fill();
      ctx.strokeStyle = costume.accentColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Miner Head
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.arc(0, -29, 10, 0, Math.PI * 2);
      ctx.fill();

      // Miner Helmet / Character Hat
      ctx.fillStyle = character.primaryColor;
      ctx.beginPath();
      ctx.arc(0, -31, 11, Math.PI, 0);
      ctx.fill();
      // Headlamp glow
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(0, -34, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Winch Drum at (0, 0)
      ctx.fillStyle = w.noahOverloadReady ? '#38BDF8' : '#F59E0B';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 4. Aiming Guide Line while swinging
      const hx = minerX + Math.sin(w.hookAngle) * w.hookLength;
      const hy = minerY + Math.cos(w.hookAngle) * w.hookLength;

      if (w.hookState === 'swinging') {
        ctx.save();
        ctx.setLineDash([4, 6]);
        const guideLen = run.characterId === 'barton' ? 230 : 145;
        ctx.strokeStyle = w.noahOverloadReady
          ? 'rgba(56, 189, 248, 0.55)'
          : 'rgba(251, 191, 36, 0.32)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(
          minerX + Math.sin(w.hookAngle) * guideLen,
          minerY + Math.cos(w.hookAngle) * guideLen
        );
        ctx.stroke();
        ctx.restore();
      }

      // 5. Draw Resources
      for (const res of w.resources) {
        if (res.collected) continue;
        res.pulsePhase += dt * 3;

        ctx.save();
        ctx.translate(res.x, res.y);

        // Glow for S1, S2, M or Flare active
        if (res.tier === 'S1' || res.tier === 'S2' || res.tier === 'M' || activeBuffs.flareSec > 0) {
          const glowRadius = res.radius + 6 + Math.sin(res.pulsePhase) * 2.5;
          const grad = ctx.createRadialGradient(0, 0, res.radius * 0.4, 0, 0, glowRadius);
          grad.addColorStop(0, res.subType.borderColor);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = res.subType.color;
        ctx.strokeStyle = res.subType.borderColor;
        ctx.lineWidth = 2.2;

        // Distinct geometric shapes per resource type
        ctx.beginPath();
        if (res.subType.shape === 'diamond') {
          ctx.moveTo(0, -res.radius * 1.15);
          ctx.lineTo(res.radius * 1.1, 0);
          ctx.lineTo(0, res.radius * 1.15);
          ctx.lineTo(-res.radius * 1.1, 0);
          ctx.closePath();
        } else if (res.subType.shape === 'crystal') {
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const r = i % 2 === 0 ? res.radius * 1.08 : res.radius * 0.88;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
        } else if (res.subType.shape === 'star') {
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI / 4) * i;
            const r = i % 2 === 0 ? res.radius * 1.2 : res.radius * 0.55;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
        } else if (res.subType.shape === 'polygon') {
          const sides = 7;
          for (let i = 0; i < sides; i++) {
            const a = ((Math.PI * 2) / sides) * i;
            const r = res.radius * (i % 2 === 0 ? 1.0 : 0.84);
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
        } else {
          ctx.arc(0, 0, res.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        // Price & Tier Tag inside/below ore so player can judge risk/reward immediately
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (res.tier === 'M' && !res.revealedPrice) {
          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          ctx.fillText('?', 0, 0);
        } else {
          ctx.fillText(res.tier, 0, -2);
          ctx.fillStyle = '#FEF08A';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(`${res.basePrice}G`, 0, 8);
        }

        // Small weight dot badge at top-right of ore
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(res.radius * 0.7, -res.radius * 0.7, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = res.weightLevel >= 3 ? '#F87171' : '#E2E8F0';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillText(`W${res.weightLevel}`, res.radius * 0.7, -res.radius * 0.7 + 0.5);

        ctx.restore();
      }

      // 6. Draw Obstacles (with 3-hit durability cracks & badge)
      for (const obs of w.obstacles) {
        if (obs.destroyed) continue;
        ctx.save();
        ctx.translate(obs.x, obs.y);

        if (obs.type === 'static') {
          // Jagged dark rock block with hazard stripes
          ctx.fillStyle = obs.hp === 1 ? '#475569' : '#334155';
          ctx.strokeStyle = obs.hp === 1 ? '#FACC15' : '#EF4444';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(-obs.radius, -obs.radius * 0.6);
          ctx.lineTo(-obs.radius * 0.3, -obs.radius);
          ctx.lineTo(obs.radius * 0.6, -obs.radius * 0.8);
          ctx.lineTo(obs.radius, 0);
          ctx.lineTo(obs.radius * 0.7, obs.radius * 0.85);
          ctx.lineTo(-obs.radius * 0.5, obs.radius);
          ctx.lineTo(-obs.radius, obs.radius * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Draw crack lines if damaged (hp < maxHp)
          if (obs.hp < obs.maxHp) {
            ctx.strokeStyle = '#FDE047';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-obs.radius * 0.4, -obs.radius * 0.6);
            ctx.lineTo(0, -2);
            ctx.lineTo(obs.radius * 0.45, obs.radius * 0.5);
            if (obs.hp === 1) {
              ctx.moveTo(obs.radius * 0.4, -obs.radius * 0.5);
              ctx.lineTo(-2, 2);
              ctx.lineTo(-obs.radius * 0.5, obs.radius * 0.4);
            }
            ctx.stroke();
          }

          ctx.fillStyle = '#FCA5A5';
          ctx.font = 'bold 9px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`岩障-${obs.baseDamage}`, 0, -2);
        } else if (obs.type === 'moving') {
          // Patrol Minecart / Subterranean Drill
          ctx.fillStyle = obs.hp === 1 ? '#991B1B' : '#7F1D1D';
          ctx.strokeStyle = obs.hp === 1 ? '#FACC15' : '#F87171';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.roundRect(-obs.radius * 1.15, -obs.radius * 0.75, obs.radius * 2.3, obs.radius * 1.5, 4);
          ctx.fill();
          ctx.stroke();

          // Wheels
          ctx.fillStyle = '#E2E8F0';
          ctx.beginPath();
          ctx.arc(-obs.radius * 0.6, obs.radius * 0.8, 4, 0, Math.PI * 2);
          ctx.arc(obs.radius * 0.6, obs.radius * 0.8, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#FECACA';
          ctx.font = 'bold 9px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`矿车-${obs.baseDamage}`, 0, -2);
        } else {
          // Special Hazard Pocket (Explosive Gas)
          ctx.fillStyle = '#581C87';
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FDA4AF';
          ctx.font = 'bold 9px "Noto Sans SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`瓦斯-${obs.baseDamage}`, 0, 0);
        }

        // 3-Hit Durability Badge on static & moving obstacles
        if (obs.type !== 'hazard') {
          ctx.fillStyle = '#111827';
          ctx.fillRect(-13, obs.radius * 0.35, 26, 11);
          ctx.strokeStyle = obs.hp === 1 ? '#FACC15' : '#F87171';
          ctx.lineWidth = 1;
          ctx.strokeRect(-13, obs.radius * 0.35, 26, 11);
          ctx.fillStyle = obs.hp === 1 ? '#FDE047' : '#FFFFFF';
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${obs.hp}/${obs.maxHp}`, 0, obs.radius * 0.35 + 5.5);
        }

        ctx.restore();
      }

      // 7. Draw Hook Cable & Claw
      ctx.save();
      ctx.strokeStyle = w.noahOverloadReady
        ? '#38BDF8'
        : activeBuffs.overclockSec > 0
        ? '#FACC15'
        : '#CBD5E1';
      ctx.lineWidth = w.noahOverloadReady || activeBuffs.overclockSec > 0 ? 3 : 2.2;
      ctx.beginPath();
      ctx.moveTo(minerX, minerY);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      // Claw head at (hx, hy) rotated by hookAngle
      ctx.translate(hx, hy);
      ctx.rotate(-w.hookAngle);
      ctx.strokeStyle = w.noahOverloadReady ? '#38BDF8' : '#F59E0B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Left prong
      ctx.moveTo(0, -2);
      ctx.lineTo(-10, 6);
      ctx.lineTo(-6, 13);
      // Right prong
      ctx.moveTo(0, -2);
      ctx.lineTo(10, 6);
      ctx.lineTo(6, 13);
      ctx.stroke();

      // Pivot bolt
      ctx.fillStyle = '#F8FAFC';
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Live retrieval metrics pill next to retracting hook when carrying ore
      if (w.hookState === 'retracting' && w.grabbedRes) {
        const metrics = ResourceSystem.calculateRetrievalMetrics(
          w.grabbedRes.weightLevel,
          w.grabbedRes.tier,
          w.obstaclePenaltyActive,
          run,
          activeBuffs.overclockSec > 0,
          w.noahOverloadReady
        );
        ctx.save();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const label = `W${w.grabbedRes.weightLevel} · 回收倍率×${metrics.pullSpeedMultiplier}`;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(hx + 16, hy - 12, 118, 20);
        ctx.strokeStyle = w.obstaclePenaltyActive ? '#EF4444' : '#F59E0B';
        ctx.strokeRect(hx + 16, hy - 12, 118, 20);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(label, hx + 22, hy + 1);
        ctx.restore();
      }

      // 8. Visibility Radius Mask (Fog of War when weather visibility < 1.0 and Flare not active)
      let visMult = run.finalWeather.visibilityMult;
      if (run.equipmentIds.includes('eq_weather_meter')) visMult += 0.15;
      if (run.equipmentIds.includes('eq_home_spectrometer')) visMult += 0.25;
      if (activeBuffs.flareSec > 0) visMult = 1.2;

      if (visMult < 0.96) {
        const spotRadius = Math.max(115, 380 * visMult);
        const offCanvas = document.createElement('canvas');
        offCanvas.width = GAME_CONFIG.CANVAS_WIDTH;
        offCanvas.height = GAME_CONFIG.CANVAS_HEIGHT;
        const octx = offCanvas.getContext('2d');
        if (octx) {
          // Dark/fog shroud over underground area
          octx.fillStyle =
            run.finalWeather.id.includes('sand') || run.finalWeather.id === 'combo_buried_ruins'
              ? 'rgba(69, 26, 3, 0.86)'
              : run.finalWeather.id === 'fog' || run.finalWeather.id === 'combo_miasma'
              ? 'rgba(30, 41, 59, 0.86)'
              : 'rgba(6, 9, 17, 0.88)';
          octx.fillRect(0, GAME_CONFIG.SOIL_TOP_Y, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);

          // Cut out spotlight around Miner and around Hook Tip
          octx.globalCompositeOperation = 'destination-out';

          const minerSpot = octx.createRadialGradient(minerX, minerY + 30, spotRadius * 0.35, minerX, minerY + 30, spotRadius);
          minerSpot.addColorStop(0, 'rgba(0,0,0,1)');
          minerSpot.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = minerSpot;
          octx.beginPath();
          octx.arc(minerX, minerY + 30, spotRadius, 0, Math.PI * 2);
          octx.fill();

          // Secondary spotlight around Hook Tip
          const hookSpotRadius = 85;
          const hookSpot = octx.createRadialGradient(hx, hy, 20, hx, hy, hookSpotRadius);
          hookSpot.addColorStop(0, 'rgba(0,0,0,1)');
          hookSpot.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = hookSpot;
          octx.beginPath();
          octx.arc(hx, hy, hookSpotRadius, 0, Math.PI * 2);
          octx.fill();

          ctx.drawImage(offCanvas, 0, 0);
        }
      }

      // 9. Weather Particle Layer (Rain, Snow, Sand, Hail, Meteor)
      const wid = run.finalWeather.id;
      const isRain = wid === 'rain' || wid === 'combo_flooded_shaft' || wid === 'combo_torrential_jungle';
      const isSnowOrHail = wid === 'snow' || wid === 'hail';
      const isSand = wid === 'sandstorm' || wid === 'combo_sand_tempest' || wid === 'combo_buried_ruins' || wid === 'gale' || wid === 'combo_wind_erosion';

      if (isRain || isSnowOrHail || isSand) {
        ctx.save();
        for (const wp of w.weatherParticles) {
          if (isRain) {
            wp.x -= 35 * dt;
            wp.y += wp.vy * 2.4 * dt;
            ctx.strokeStyle = `rgba(147, 197, 253, ${wp.alpha})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(wp.x, wp.y);
            ctx.lineTo(wp.x - 4, wp.y + 11);
            ctx.stroke();
          } else if (isSnowOrHail) {
            wp.x += Math.sin(now * 0.002 + wp.y) * 18 * dt;
            wp.y += (wid === 'hail' ? wp.vy * 2.1 : wp.vy * 0.7) * dt;
            ctx.fillStyle = `rgba(241, 245, 249, ${wp.alpha})`;
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, wp.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (isSand) {
            wp.x += 180 * dt;
            wp.y += Math.sin(now * 0.003 + wp.x) * 15 * dt;
            ctx.fillStyle = `rgba(251, 191, 36, ${wp.alpha * 0.75})`;
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, wp.size * 1.1, 0, Math.PI * 2);
            ctx.fill();
          }

          if (wp.y > GAME_CONFIG.CANVAS_HEIGHT) wp.y = 0;
          if (wp.x > GAME_CONFIG.CANVAS_WIDTH) wp.x = 0;
          if (wp.x < 0) wp.x = GAME_CONFIG.CANVAS_WIDTH;
        }
        ctx.restore();
      }

      // 10. Lightning Bolts
      for (let i = w.lightningBolts.length - 1; i >= 0; i--) {
        const lb = w.lightningBolts[i];
        lb.alpha -= dt * 2.6;
        if (lb.alpha <= 0) {
          w.lightningBolts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.strokeStyle = lb.color;
        ctx.globalAlpha = lb.alpha;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        lb.points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 11. Shockwave Rings (Smooth circle for Ore Grab, Jagged Starburst for Obstacle/Wall Hit)
      for (let i = w.shockwaves.length - 1; i >= 0; i--) {
        const sw = w.shockwaves[i];
        sw.life += dt;
        if (sw.life >= sw.maxLife) {
          w.shockwaves.splice(i, 1);
          continue;
        }
        const progress = sw.life / sw.maxLife;
        const curR = sw.radius + (sw.maxRadius - sw.radius) * (1 - Math.pow(1 - progress, 2));
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.isJagged ? 3.5 : 3;
        ctx.beginPath();
        if (sw.isJagged) {
          const spikes = 10;
          for (let s = 0; s < spikes; s++) {
            const ang = ((Math.PI * 2) / spikes) * s;
            const r = s % 2 === 0 ? curR : curR * 0.72;
            const px = sw.x + Math.cos(ang) * r;
            const py = sw.y + Math.sin(ang) * r;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.arc(sw.x, sw.y, curR, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 12. Burst Particles
      for (let i = w.particles.length - 1; i >= 0; i--) {
        const pt = w.particles[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          w.particles.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        ctx.save();
        ctx.globalAlpha = 1 - pt.life / pt.maxLife;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 13. Floating Texts & Gold Fly-In to HUD
      for (let i = w.floatingTexts.length - 1; i >= 0; i--) {
        const ft = w.floatingTexts[i];
        ft.life += dt;
        if (ft.life >= ft.maxLife) {
          w.floatingTexts.splice(i, 1);
          continue;
        }
        const progress = ft.life / ft.maxLife;
        let curX = ft.x;
        let curY = ft.y - progress * 34;
        if (ft.isGoldFlyIn && ft.targetX !== undefined && ft.targetY !== undefined) {
          const ease = 1 - Math.pow(1 - progress, 2);
          curX = ft.x + (ft.targetX - ft.x) * ease;
          curY = ft.y + (ft.targetY - ft.y) * ease;
        }

        ctx.save();
        ctx.globalAlpha = progress > 0.75 ? (1 - progress) * 4 : 1;
        ctx.font = 'bold 13px "JetBrains Mono", "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#090D16';
        ctx.lineWidth = 3;
        ctx.strokeText(ft.text, curX, curY);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, curX, curY);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(updateAndDraw);
    };

    animationFrameId = requestAnimationFrame(updateAndDraw);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    run,
    costume,
    character,
    isPaused,
    activeBuffs,
    timeRemaining,
    onUpdateRun,
    onStageEnd,
    onDiscoverResource,
    onConsumeMagnet,
    spawnBurst,
    addFloatingText,
    triggerGrabFeedback,
    triggerDamageFeedback,
  ]);

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none ${
        hitJolt ? 'animate-hit-jolt' : grabPulse !== 'none' ? 'animate-grab-pop' : ''
      }`}
    >
      {/* Grab Success Crisp Memphis Border Flash */}
      {grabPulse !== 'none' && (
        <div
          className={`pointer-events-none absolute inset-0 z-30 border-4 transition-opacity ${
            grabPulse === 'heavy' ? 'border-[#FFDE00] bg-[#FFDE00]/10' : 'border-[#38BDF8] bg-[#38BDF8]/10'
          }`}
        />
      )}

      {/* Red Damage Vignette Flash */}
      {damageFlash && (
        <div className="pointer-events-none absolute inset-0 z-30 bg-red-500/30 border-4 border-[#111827] ring-4 ring-inset ring-red-500 transition-opacity" />
      )}

      {/* Weather Combo / Meter Notification Banner */}
      {weatherBanner && (
        <div className="pointer-events-none absolute top-11 left-3 right-3 z-20 bg-[#FFDE00] border-2 border-[#111827] text-[#111827] text-xs font-extrabold px-3 py-1.5 rounded-lg text-center shadow-[3px_3px_0px_#111827]">
          {weatherBanner}
        </div>
      )}

      {/* Collapse Node Urgent Objective Banner */}
      {run.currentNodeType === 'NODE_COLLAPSE' && (
        <div className="pointer-events-none absolute top-11 left-3 right-3 z-20 bg-[#FF6B6B] border-2 border-[#111827] text-white text-xs font-extrabold px-3 py-1.5 rounded-lg flex items-center justify-between shadow-[3px_3px_0px_#111827]">
          <span>🚨 塌方层紧急采集：60秒内抓满3个矿点脱离！</span>
          <span className="font-mono-num bg-[#111827] text-[#FFDE00] px-2 py-0.5 rounded">
            {run.collapseGrabs} / 3
          </span>
        </div>
      )}

      {/* Contract Active Objective Pill */}
      {run.contractSigned && (
        <div className="pointer-events-none absolute top-11 right-3 z-20 bg-[#A855F7] border-2 border-[#111827] text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827]">
          📜 矿灵契约生效中 (每层+30G · 抓矿速度+15%)
        </div>
      )}

      {/* Tutorial Step-by-Step Guide Overlay */}
      {run.isTutorial && (
        <div className="pointer-events-none absolute top-11 left-3 right-3 z-20 bg-[#FFFDF7] border-2 border-[#111827] px-3 py-2 rounded-lg shadow-[3px_3px_0px_#111827]">
          <div className="flex items-center justify-between text-xs text-[#111827] font-extrabold mb-0.5">
            <span className="bg-[#4ADE80] px-1.5 py-0.5 rounded border border-[#111827]">
              新手教程 · 锁血保护中
            </span>
            <span className="font-mono-num bg-[#FFDE00] px-2 py-0.5 rounded border border-[#111827]">
              进度：{run.tutorialGrabs} / {GAME_CONFIG.TUTORIAL_TARGET_COUNT}
            </span>
          </div>
          <p className="text-xs text-[#111827] font-semibold leading-snug mt-1">
            {run.tutorialGrabs === 0 && '第1步：观察吊钩摆动与虚线瞄准线，点击画面或按 Space 键发射吊钩抓矿！'}
            {run.tutorialGrabs === 1 && '第2步：矿石上的 W1~W4 代表重量等级。S2 钻芯(W1)既轻又值200G，试试瞄准它！'}
            {run.tutorialGrabs === 2 && '第3步：天气已变为【雨天】！障碍物抓满 3 次即可彻底粉碎销毁！'}
            {run.tutorialGrabs === 3 && '第4步：紫色 ? 是【神秘矿囊(M)】，结算时随机开出 5~205 金币！'}
            {run.tutorialGrabs >= 4 && '最后一步：再抓 1 个矿石即可完成教学，进入正式路线选择！'}
          </p>
        </div>
      )}

      {/* Live Aim Ray Tactical Preview Bar (Memphis Neo-Brutalist Header Strip) */}
      <div className="w-full bg-[#FFFDF7] border-b-3 border-[#111827] px-3 py-1.5 flex items-center justify-between text-xs min-h-[34px]">
        {aimPreview ? (
          <div className="flex items-center gap-1.5 truncate font-bold">
            <span className="text-[#111827] bg-[#FFDE00] border border-[#111827] px-1.5 py-0.2 rounded text-[11px]">
              瞄准
            </span>
            <span
              className={
                aimPreview.isObstacle
                  ? 'text-[#DC2626] font-extrabold'
                  : 'text-[#111827] font-extrabold'
              }
            >
              {aimPreview.name} [{aimPreview.tier}]
            </span>
            <span className="text-[#111827]">·</span>
            <span
              className={`font-mono-num font-extrabold ${
                aimPreview.isObstacle ? 'text-[#DC2626]' : 'text-[#059669]'
              }`}
            >
              {aimPreview.priceText}
            </span>
            {!aimPreview.isObstacle && (
              <>
                <span className="text-[#111827]">·</span>
                <span className="font-mono-num text-[#374151]">
                  W{aimPreview.weightLevel}({aimPreview.estSec}s)
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-[#111827] font-bold">
            点击矿区画面或按{' '}
            <kbd className="px-1.5 py-0.5 bg-[#FFDE00] text-[#111827] border border-[#111827] rounded text-[11px] font-mono-num shadow-[1px_1px_0px_#111827]">
              Space
            </kbd>{' '}
            发射吊钩（障碍抓3次可销毁）
          </span>
        )}

        {run.characterId === 'noah' && (
          <span className="font-mono-num text-[11px] font-extrabold bg-[#38BDF8] text-[#111827] border border-[#111827] px-1.5 py-0.5 rounded shrink-0 ml-2">
            {run.noahComboCount >= 3 ? '⚡超载就绪!' : `充能 ${run.noahComboCount}/3`}
          </span>
        )}
      </div>

      {/* Interactive HTML5 Game Canvas */}
      <canvas
        ref={canvasRef}
        width={GAME_CONFIG.CANVAS_WIDTH}
        height={GAME_CONFIG.CANVAS_HEIGHT}
        onClick={handleShootHook}
        className="w-full flex-1 object-contain cursor-crosshair touch-manipulation bg-[#090D16]"
      />
    </div>
  );
};
