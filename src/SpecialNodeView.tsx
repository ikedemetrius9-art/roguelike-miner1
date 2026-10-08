import React, { useState } from 'react';
import { GAME_CONFIG, CurseConfig, FateBuffConfig } from './gameConfig';
import {
  RunState,
  RouteNodeType,
  RandomSystem,
} from './systems';
import { SoundFX } from './sound';

export interface SpecialNodeViewProps {
  run: RunState;
  setRun: React.Dispatch<React.SetStateAction<RunState | null>>;
  blackMarketStock: { costumeId: string; name: string; price: number; bought: boolean }[];
  setBlackMarketStock: React.Dispatch<
    React.SetStateAction<{ costumeId: string; name: string; price: number; bought: boolean }[]>
  >;
  chestRewardGold: number;
  onFinishSpecialNode: (warpDepthDelta?: number) => void;
  onTriggerFailure: () => void;
  showToast: (msg: string) => void;
}

export const SpecialNodeView: React.FC<SpecialNodeViewProps> = ({
  run,
  setRun,
  blackMarketStock,
  setBlackMarketStock,
  chestRewardGold,
  onFinishSpecialNode,
  onTriggerFailure,
  showToast,
}) => {
  const [resolvedType, setResolvedType] = useState<RouteNodeType>(run.currentNodeType);
  const [unknownEmptyMsg, setUnknownEmptyMsg] = useState<string | null>(null);
  const [gambleResult, setGambleResult] = useState<string | null>(null);
  const [curseDone, setCurseDone] = useState<string | null>(null);
  const [sacrificeDone, setSacrificeDone] = useState<string | null>(null);
  const [eliteResult, setEliteResult] = useState<string | null>(null);
  const [fateDone, setFateDone] = useState<string | null>(null);
  const [relicDone, setRelicDone] = useState<string | null>(null);
  const [echoDone, setEchoDone] = useState<string | null>(null);
  const [trapResolved, setTrapResolved] = useState<string | null>(null);
  const [purgeFreeUsed, setPurgeFreeUsed] = useState<boolean>(false);
  const [warpDelta, setWarpDelta] = useState<number | null>(null);

  const availableGold = Math.max(0, run.totalEarnedGold - run.totalSpentGold);

  // Pick 3 Fate Buffs deterministically for this depth
  const fateOptions: FateBuffConfig[] = React.useMemo(() => {
    const rng = new RandomSystem(`${run.runSeed}::fate-${run.depth}`);
    const pool = [...GAME_CONFIG.FATE_BUFFS];
    const picked: FateBuffConfig[] = [];
    while (picked.length < 3 && pool.length > 0) {
      const idx = rng.rangeInt(0, pool.length - 1);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }, [run.runSeed, run.depth]);

  // Helper to add pending costume shards
  const addPendingShards = (count: number): { nextPending: Record<string, number>; shardNames: string[] } => {
    const shardCos = GAME_CONFIG.COSTUMES.filter((c) => c.shardsRequired > 0);
    const nextPending = { ...run.pendingShards };
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const pick = shardCos[Math.floor(Math.random() * shardCos.length)];
      nextPending[pick.id] = (nextPending[pick.id] || 0) + 1;
      names.push(pick.name);
    }
    return { nextPending, shardNames: names };
  };

  // Clear Parasite helper (allowed at Heal 50, Heal Full, Black Market, Purge)
  const handlePurgeParasite = () => {
    if (run.parasiteFloorsLeft <= 0) return;
    SoundFX.heal();
    setRun((prev) => (prev ? { ...prev, parasiteFloorsLeft: 0 } : null));
    showToast('✨ 已彻底清除装备上的紫色寄生矿孢！');
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-y-auto">
      <div className="my-auto space-y-3">
        {/* Parasite Purge Banner if infected and in Heal / Black Market */}
        {run.parasiteFloorsLeft > 0 &&
          (resolvedType === 'NODE_HEAL_50' ||
            resolvedType === 'NODE_HEAL_FULL' ||
            resolvedType === 'NODE_BLACK_MARKET') && (
            <div className="p-3 bg-[#F3E8FF] border-3 border-[#111827] rounded-xl shadow-[3px_3px_0px_#111827] flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-[#111827]">
                🦠 检测到寄生矿孢（剩余 {run.parasiteFloorsLeft} 层，每层+20G/-3HP）
              </div>
              <button
                onClick={handlePurgeParasite}
                className="px-3 py-1.5 bg-[#4ADE80] border-2 border-[#111827] rounded-lg text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
              >
                免费净化清除
              </button>
            </div>
          )}

        {/* 1. NODE_HEAL_50 & NODE_HEAL_FULL */}
        {(resolvedType === 'NODE_HEAL_50' || resolvedType === 'NODE_HEAL_FULL') && (
          <div className="p-5 bg-[#DCFCE7] border-3 border-[#111827] rounded-2xl text-center space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="inline-block px-3 py-1 bg-[#4ADE80] border-2 border-[#111827] rounded-full text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827]">
              💚 营地休整点 (恢复续航类)
            </div>
            <h3 className="text-xl font-extrabold text-[#111827]">
              {resolvedType === 'NODE_HEAL_FULL' ? '保存完好的休整室' : '简易休整点'}
            </h3>
            <p className="text-xs font-bold text-[#374151]">
              {resolvedType === 'NODE_HEAL_FULL'
                ? `前方是一间保存完好的休整室，HP 已恢复至上限 (${run.maxHp})。`
                : `前方有一处简易休整点，HP 已恢复 +50（当前 ${run.hp}/${run.maxHp}）。`}
            </p>
            <div className="text-lg font-mono-num font-extrabold text-[#059669] bg-white border-2 border-[#111827] py-2 rounded-xl shadow-[2px_2px_0px_#111827]">
              当前生命值：{run.hp} / {run.maxHp} HP
            </div>
          </div>
        )}

        {/* 2. NODE_PURGE (净化层) */}
        {resolvedType === 'NODE_PURGE' && (
          <div className="p-4 bg-[#CCFBF1] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#2DD4BF] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              💧 净化层 · 发光冷泉
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">一池发光的冷泉</h3>
            <p className="text-xs font-bold text-[#374151]">
              免费移除 1 个诅咒/寄生并回复 15 HP；还可花 100 金币额外再移除 1 个负面状态。
            </p>
            <div className="space-y-2">
              <button
                disabled={purgeFreeUsed}
                onClick={() => {
                  if (purgeFreeUsed) return;
                  SoundFX.heal();
                  setPurgeFreeUsed(true);
                  setRun((prev) => {
                    if (!prev) return null;
                    const nextCurses = [...prev.curses];
                    let nextParasite = prev.parasiteFloorsLeft;
                    let nextMaxHp = prev.maxHp;
                    if (nextParasite > 0) {
                      nextParasite = 0;
                    } else if (nextCurses.length > 0) {
                      const removed = nextCurses.pop();
                      if (removed === 'curse_max_hp') nextMaxHp += 10;
                    }
                    return {
                      ...prev,
                      maxHp: nextMaxHp,
                      hp: Math.min(nextMaxHp, prev.hp + 15),
                      curses: nextCurses,
                      parasiteFloorsLeft: nextParasite,
                    };
                  });
                  showToast('💧 冷泉洗礼：已回复 15 HP 并移除 1 项负面状态！');
                }}
                className={`w-full py-2.5 px-3 border-2 border-[#111827] rounded-xl text-xs font-extrabold shadow-[2px_2px_0px_#111827] ${
                  !purgeFreeUsed
                    ? 'bg-[#4ADE80] hover:bg-[#22C55E] cursor-pointer'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {purgeFreeUsed ? '✓ 已享用免费冷泉净化 (+15HP)' : '✨ 免费饮用冷泉：移除1个诅咒/寄生 + 回复15HP'}
              </button>

              {(run.curses.length > 0 || run.parasiteFloorsLeft > 0) && (
                <button
                  disabled={availableGold < 100}
                  onClick={() => {
                    if (availableGold < 100) return;
                    SoundFX.heal();
                    setRun((prev) => {
                      if (!prev) return null;
                      const nextCurses = [...prev.curses];
                      let nextParasite = prev.parasiteFloorsLeft;
                      let nextMaxHp = prev.maxHp;
                      if (nextParasite > 0) {
                        nextParasite = 0;
                      } else if (nextCurses.length > 0) {
                        const removed = nextCurses.pop();
                        if (removed === 'curse_max_hp') nextMaxHp += 10;
                      }
                      return {
                        ...prev,
                        maxHp: nextMaxHp,
                        totalSpentGold: prev.totalSpentGold + 100,
                        curses: nextCurses,
                        parasiteFloorsLeft: nextParasite,
                      };
                    });
                    showToast('💧 花费 100G 深度净化了 1 项诅咒/寄生！');
                  }}
                  className={`w-full py-2.5 px-3 border-2 border-[#111827] rounded-xl text-xs font-extrabold shadow-[2px_2px_0px_#111827] ${
                    availableGold >= 100
                      ? 'bg-[#FFDE00] hover:bg-[#FACC15] cursor-pointer'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  💰 花费 100G 额外移除 1 个诅咒/寄生
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. NODE_CHEST */}
        {resolvedType === 'NODE_CHEST' && (
          <div className="p-5 bg-[#FEF9C3] border-3 border-[#111827] rounded-2xl text-center space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="inline-block px-3 py-1 bg-[#FFDE00] border-2 border-[#111827] rounded-full text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827]">
              📦 矿道遗落宝箱
            </div>
            <h3 className="text-xl font-extrabold text-[#111827]">开启沉重旧宝箱</h3>
            <p className="text-xs font-bold text-[#374151]">
              道路尽头有一只沉重旧宝箱，无普通层金币目标压力。
            </p>
            <div className="text-2xl font-mono-num font-extrabold text-[#D97706] bg-white border-2 border-[#111827] py-2.5 rounded-xl shadow-[3px_3px_0px_#111827]">
              +{chestRewardGold} G
            </div>
          </div>
        )}

        {/* 4. NODE_CHECKPOINT */}
        {resolvedType === 'NODE_CHECKPOINT' && (
          <div className="p-5 bg-[#E0F2FE] border-3 border-[#111827] rounded-2xl text-center space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="inline-block px-3 py-1 bg-[#38BDF8] border-2 border-[#111827] rounded-full text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827]">
              💾 深度 {run.depth} 固定存档层
            </div>
            <h3 className="text-xl font-extrabold text-[#111827]">中继站存档已创建</h3>
            <p className="text-xs font-bold text-[#374151]">
              这里留下了可靠的补给记录。已保存当前深度、累计收益 ({run.totalEarnedGold}G)、HP、局内装备与未入库黑市碎片。
            </p>
            <div className="text-xs font-extrabold text-[#0369A1] bg-white border-2 border-[#111827] p-2.5 rounded-xl">
              若后续深入失败，可选择【返回存档点继续】或【直接结算带回 30% 金币】！
            </div>
          </div>
        )}

        {/* 5. NODE_BLACK_MARKET */}
        {resolvedType === 'NODE_BLACK_MARKET' && (
          <div className="p-4 bg-[#F3E8FF] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#111827]">🕵️ 地下黑市交易</h3>
                <p className="text-[11px] font-bold text-[#4B5563]">
                  使用局内可用金币购买服装碎片；成功撤离才永久入库！
                  {run.curses.includes('curse_bm_up') && (
                    <span className="text-[#DC2626] ml-1">(诅咒：价格+20%)</span>
                  )}
                </p>
              </div>
              <div className="text-right font-mono-num bg-[#FFDE00] border-2 border-[#111827] px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827]">
                <div className="text-[10px] font-bold">可用金币</div>
                <div className="text-sm font-extrabold">{availableGold} G</div>
              </div>
            </div>

            <div className="space-y-2">
              {blackMarketStock.map((item, idx) => {
                const canAfford = availableGold >= item.price;
                return (
                  <div
                    key={idx}
                    className="p-3 bg-white border-2 border-[#111827] rounded-xl flex items-center justify-between shadow-[2px_2px_0px_#111827]"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-[#111827]">{item.name}</div>
                      <div className="text-[11px] font-bold text-[#6B21A8]">
                        撤离后永久入库 · 失败则丢失
                      </div>
                    </div>
                    <button
                      disabled={item.bought || !canAfford}
                      onClick={() => {
                        if (item.bought || !canAfford) return;
                        SoundFX.buyItem();
                        setBlackMarketStock((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, bought: true } : it))
                        );
                        setRun((prev) => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            totalSpentGold: prev.totalSpentGold + item.price,
                            pendingShards: {
                              ...prev.pendingShards,
                              [item.costumeId]: (prev.pendingShards[item.costumeId] || 0) + 1,
                            },
                          };
                        });
                        showToast(`🕵️ 购入 ${item.name}（待撤离入库）`);
                      }}
                      className={`px-3 py-1.5 rounded-lg border-2 border-[#111827] text-xs font-mono-num font-extrabold whitespace-nowrap ${
                        item.bought
                          ? 'bg-gray-200 text-gray-500'
                          : canAfford
                          ? 'bg-[#C084FC] hover:bg-[#A855F7] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {item.bought ? '已购入' : `${item.price} G`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. NODE_UNKNOWN (未知层) */}
        {resolvedType === 'NODE_UNKNOWN' && (
          <div className="p-5 bg-[#E0F2FE] border-3 border-[#111827] rounded-2xl text-center space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="inline-block px-3 py-1 bg-[#38BDF8] border-2 border-[#111827] rounded-full text-xs font-extrabold text-[#111827] shadow-[2px_2px_0px_#111827]">
              ❓ 未知层 · 回声迷道
            </div>
            <h3 className="text-lg font-extrabold text-[#111827]">
              三条矿道一模一样，连回声都相同
            </h3>
            <p className="text-xs font-bold text-[#374151]">
              进入后从【宝箱 / 黑市 / 回复 / 诅咒 / 精英 / 空事件】中随机揭示，不判普通金币目标。
            </p>
            {unknownEmptyMsg ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827]">
                {unknownEmptyMsg}
              </div>
            ) : (
              <button
                onClick={() => {
                  SoundFX.click();
                  const outcomes: ('chest' | 'blackMarket' | 'heal' | 'curse' | 'elite' | 'empty')[] = [
                    'chest',
                    'blackMarket',
                    'heal',
                    'curse',
                    'elite',
                    'empty',
                  ];
                  const pick = outcomes[Math.floor(Math.random() * outcomes.length)];
                  if (pick === 'chest') {
                    setRun((prev) =>
                      prev ? { ...prev, totalEarnedGold: prev.totalEarnedGold + chestRewardGold } : null
                    );
                    setResolvedType('NODE_CHEST');
                  } else if (pick === 'blackMarket') {
                    setResolvedType('NODE_BLACK_MARKET');
                  } else if (pick === 'heal') {
                    setRun((prev) =>
                      prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + 50) } : null
                    );
                    setResolvedType('NODE_HEAL_50');
                  } else if (pick === 'curse') {
                    setResolvedType('NODE_CURSE');
                  } else if (pick === 'elite') {
                    setResolvedType('NODE_ELITE');
                  } else {
                    setUnknownEmptyMsg('💨 揭示结果：【空旷回声廊】这里只有空荡的回声，平安无事。');
                  }
                }}
                className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] border-3 border-[#111827] rounded-xl text-sm font-extrabold text-[#111827] shadow-[4px_4px_0px_#111827] cursor-pointer"
              >
                🔍 踏入迷雾 · 揭示未知事件
              </button>
            )}
          </div>
        )}

        {/* 7. NODE_GAMBLE (赌徒矿层) */}
        {resolvedType === 'NODE_GAMBLE' && (
          <div className="p-4 bg-[#FCE7F3] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 bg-[#EC4899] text-white border-2 border-[#111827] rounded-lg text-xs font-extrabold">
                🎲 赌徒矿层
              </span>
              <span className="font-mono-num text-xs font-extrabold bg-white border-2 border-[#111827] px-2 py-0.5 rounded">
                可用金币：{availableGold} G
              </span>
            </div>
            <h3 className="text-base font-extrabold text-[#111827]">一个戴兜帽的矿工在摇骰子</h3>
            <p className="text-xs font-bold text-[#374151]">
              可押注本次深入金币的 10% / 25% / 50%。赢则获得 1.5~2 倍回报，输则失去押注；也可直接离开。
            </p>

            {gambleResult ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold text-center">
                {gambleResult}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '押注 10%', ratio: 0.1 },
                  { label: '押注 25%', ratio: 0.25 },
                  { label: '押注 50%', ratio: 0.5 },
                ].map((bet) => {
                  const wager = Math.max(10, Math.round(availableGold * bet.ratio));
                  const canBet = availableGold >= wager && availableGold > 0;
                  return (
                    <button
                      key={bet.label}
                      disabled={!canBet}
                      onClick={() => {
                        if (!canBet) return;
                        const win = Math.random() < 0.52;
                        if (win) {
                          const mult = 1.5 + Math.random() * 0.5;
                          const profit = Math.round(wager * mult);
                          SoundFX.collectGold(profit);
                          setRun((prev) =>
                            prev ? { ...prev, totalEarnedGold: prev.totalEarnedGold + profit } : null
                          );
                          setGambleResult(`🎉 骰子大胜！押注 ${wager}G，赢得 +${profit}G！`);
                        } else {
                          SoundFX.hitObstacle(false);
                          setRun((prev) =>
                            prev ? { ...prev, totalSpentGold: prev.totalSpentGold + wager } : null
                          );
                          setGambleResult(`💸 骰子点数惜败… 失去了押注的 ${wager}G。`);
                        }
                      }}
                      className={`py-2.5 px-2 border-2 border-[#111827] rounded-xl text-xs font-extrabold shadow-[2px_2px_0px_#111827] ${
                        canBet
                          ? 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] cursor-pointer'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      <div>{bet.label}</div>
                      <div className="font-mono-num text-[11px]">({wager}G)</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 8. NODE_CURSE (诅咒矿层) */}
        {resolvedType === 'NODE_CURSE' && (
          <div className="p-4 bg-[#F3E8FF] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#A855F7] text-white border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🕸️ 诅咒矿层
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">黑色晶丝缠在矿脉上</h3>
            <p className="text-xs font-bold text-[#374151]">
              采集将获得高价值矿 (+220G) 与 1 个衣服碎片，同时随机附带 1 个本局诅咒（最大HP-10 / 受伤+10% / 金币-15% / 黑市价格+20%，各25%概率）。
            </p>
            {curseDone ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold text-[#111827]">
                {curseDone}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const curse: CurseConfig =
                      GAME_CONFIG.CURSES[Math.floor(Math.random() * GAME_CONFIG.CURSES.length)];
                    SoundFX.collectGold(220);
                    const { nextPending, shardNames } = addPendingShards(1);
                    setRun((prev) => {
                      if (!prev) return null;
                      const nextMaxHp =
                        curse.id === 'curse_max_hp' ? Math.max(40, prev.maxHp - 10) : prev.maxHp;
                      return {
                        ...prev,
                        maxHp: nextMaxHp,
                        hp: Math.min(prev.hp, nextMaxHp),
                        totalEarnedGold: prev.totalEarnedGold + 220,
                        pendingShards: nextPending,
                        curses: [...prev.curses, curse.id],
                      };
                    });
                    setCurseDone(
                      `💎 获得暗晶 +220G 与 1 枚碎片(${shardNames[0]})！同时附带诅咒：【${curse.name}】(${curse.desc})`
                    );
                  }}
                  className="py-2.5 px-3 bg-[#FFDE00] hover:bg-[#FACC15] border-2 border-[#111827] rounded-xl text-xs font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer"
                >
                  ⚡ 强行采集诅咒矿脉
                </button>
                <button
                  onClick={() => setCurseDone('已谨慎绕开黑色晶丝，未受诅咒。')}
                  className="py-2.5 px-3 bg-white hover:bg-gray-100 border-2 border-[#111827] rounded-xl text-xs font-extrabold shadow-[2px_2px_0px_#111827] cursor-pointer"
                >
                  🛡️ 绕行离开
                </button>
              </div>
            )}
          </div>
        )}

        {/* 9. NODE_SACRIFICE (献祭层) */}
        {resolvedType === 'NODE_SACRIFICE' && (
          <div className="p-4 bg-[#FEE2E2] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#FF6B6B] text-white border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🩸 献祭层 · 古老矿印
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">石台上刻着古老矿印（三选一）</h3>
            {sacrificeDone ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {sacrificeDone}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  disabled={run.hp <= 20}
                  onClick={() => {
                    if (run.hp <= 20) return;
                    SoundFX.collectGold(200);
                    setRun((prev) =>
                      prev
                        ? {
                            ...prev,
                            hp: prev.hp - 20,
                            totalEarnedGold: prev.totalEarnedGold + 200,
                          }
                        : null
                    );
                    setSacrificeDone('🩸 献祭 20 HP，获得了 +200 金币！');
                  }}
                  className={`w-full p-2.5 border-2 border-[#111827] rounded-xl text-xs font-extrabold flex justify-between items-center shadow-[2px_2px_0px_#111827] ${
                    run.hp > 20 ? 'bg-[#FFDE00] cursor-pointer' : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <span>① 20 HP 换 200 金币</span>
                  <span className="font-mono-num">-20HP / +200G</span>
                </button>

                <button
                  disabled={availableGold < 200}
                  onClick={() => {
                    if (availableGold < 200) return;
                    SoundFX.heal();
                    setRun((prev) =>
                      prev
                        ? {
                            ...prev,
                            totalSpentGold: prev.totalSpentGold + 200,
                            hp: Math.min(prev.maxHp, prev.hp + 20),
                          }
                        : null
                    );
                    setSacrificeDone('💚 献祭 200 金币，恢复了 +20 HP！');
                  }}
                  className={`w-full p-2.5 border-2 border-[#111827] rounded-xl text-xs font-extrabold flex justify-between items-center shadow-[2px_2px_0px_#111827] ${
                    availableGold >= 200
                      ? 'bg-[#4ADE80] cursor-pointer'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <span>② 200 金币 换 20 HP</span>
                  <span className="font-mono-num">-200G / +20HP</span>
                </button>

                <button
                  disabled={run.equipmentIds.length === 0}
                  onClick={() => {
                    if (run.equipmentIds.length === 0) return;
                    SoundFX.buyItem();
                    const removedEqId = run.equipmentIds[run.equipmentIds.length - 1];
                    const removedEq = GAME_CONFIG.ITEMS.find((i) => i.id === removedEqId);
                    const { nextPending, shardNames } = addPendingShards(2);
                    setRun((prev) =>
                      prev
                        ? {
                            ...prev,
                            equipmentIds: prev.equipmentIds.slice(0, -1),
                            pendingShards: nextPending,
                          }
                        : null
                    );
                    setSacrificeDone(
                      `✨ 献祭装备【${removedEq?.name || removedEqId}】，换取了 2 个未入库服装碎片 (${shardNames.join('、')})！`
                    );
                  }}
                  className={`w-full p-2.5 border-2 border-[#111827] rounded-xl text-xs font-extrabold flex justify-between items-center shadow-[2px_2px_0px_#111827] ${
                    run.equipmentIds.length > 0
                      ? 'bg-[#C084FC] cursor-pointer'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  <span>③ 献祭 1 件局内装备 换 2 个衣服碎片</span>
                  <span className="font-mono-num">当前装备:{run.equipmentIds.length}件</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 10. NODE_ELITE (精英守卫层) */}
        {resolvedType === 'NODE_ELITE' && (
          <div className="p-4 bg-[#FFEDD5] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#FB923C] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              ⚔️ 精英守卫层
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">岩壁后传来沉重呼吸</h3>
            <p className="text-xs font-bold text-[#374151]">
              风险采集：30% 概率 +300 金币，30% 概率 +2 个衣服碎片，40% 概率失败扣 22 HP 并强制进入下一层！
            </p>
            {eliteResult ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {eliteResult}
              </div>
            ) : (
              <button
                onClick={() => {
                  const roll = Math.random();
                  if (roll < 0.3) {
                    SoundFX.collectGold(300);
                    setRun((prev) =>
                      prev ? { ...prev, totalEarnedGold: prev.totalEarnedGold + 300 } : null
                    );
                    setEliteResult('🎉 虎口夺食成功！获得 +300 金币！');
                  } else if (roll < 0.6) {
                    SoundFX.buyItem();
                    const { nextPending, shardNames } = addPendingShards(2);
                    setRun((prev) => (prev ? { ...prev, pendingShards: nextPending } : null));
                    setEliteResult(`✨ 奇袭得手！获得 2 枚服装碎片 (${shardNames.join('、')})！`);
                  } else {
                    SoundFX.hitObstacle(true);
                    const nextHp = Math.max(0, run.hp - 22);
                    setRun((prev) => (prev ? { ...prev, hp: nextHp } : null));
                    if (nextHp <= 0) {
                      onTriggerFailure();
                      return;
                    }
                    setEliteResult('💥 惊动了精英守卫！受到 22 点伤害，即将强制撤入下一层！');
                  }
                }}
                className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] border-3 border-[#111827] rounded-xl text-sm font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                ⚔️ 发起风险采集
              </button>
            )}
          </div>
        )}

        {/* 11. NODE_FORGE (锻造层: 可重复点击铸造幸运钉 & 幸运骰) */}
        {resolvedType === 'NODE_FORGE' && (
          <div className="p-4 bg-[#FEF9C3] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 bg-[#FB923C] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
                🔨 锻造层 · 余温锻炉
              </span>
              <span className="font-mono-num text-xs font-extrabold bg-white border-2 border-[#111827] px-2 py-0.5 rounded">
                可用金币：{availableGold} G
              </span>
            </div>
            <p className="text-xs font-bold text-[#374151]">
              废弃锻炉还有余温。两个选项均可点击也可重复铸造，在三选一路线界面可随时使用！
            </p>

            <div className="space-y-2.5">
              {(() => {
                const canNail = availableGold >= 100 && run.luckyNails < 3;
                const maxDiceAllowed = Math.max(0, 10 - run.luckyDiceUsedTotal);
                const canDice = availableGold >= 50 && run.luckyDiceOwned < maxDiceAllowed;
                return (
                  <>
                    <div className="p-3 bg-white border-2 border-[#111827] rounded-xl flex items-center justify-between gap-2 shadow-[2px_2px_0px_#111827]">
                      <div>
                        <div className="text-xs font-extrabold text-[#111827]">
                          📌 铸造【幸运钉】 (持有 {run.luckyNails} / 3)
                        </div>
                        <div className="text-[11px] font-semibold text-[#4B5563]">
                          最多存3根，本局使用次数不限（路线界面可定向改造节点）
                        </div>
                      </div>
                      <button
                        disabled={!canNail}
                        onClick={() => {
                          if (!canNail) return;
                          SoundFX.buyItem();
                          setRun((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  totalSpentGold: prev.totalSpentGold + 100,
                                  luckyNails: prev.luckyNails + 1,
                                }
                              : null
                          );
                          showToast('🔨 已铸造 1 根【幸运钉】！');
                        }}
                        className={`px-3 py-2 border-2 border-[#111827] rounded-lg text-xs font-mono-num font-extrabold whitespace-nowrap ${
                          canNail
                            ? 'bg-[#FFDE00] hover:bg-[#FACC15] shadow-[2px_2px_0px_#111827] cursor-pointer'
                            : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {run.luckyNails >= 3 ? '已存满3根' : '100 G 铸造'}
                      </button>
                    </div>

                    <div className="p-3 bg-white border-2 border-[#111827] rounded-xl flex items-center justify-between gap-2 shadow-[2px_2px_0px_#111827]">
                      <div>
                        <div className="text-xs font-extrabold text-[#111827]">
                          🎲 铸造【幸运骰】 (持有 {run.luckyDiceOwned} / {maxDiceAllowed})
                        </div>
                        <div className="text-[11px] font-semibold text-[#4B5563]">
                          本局已使用 {run.luckyDiceUsedTotal}/10 次，当前最多可存 {maxDiceAllowed} 个
                        </div>
                      </div>
                      <button
                        disabled={!canDice}
                        onClick={() => {
                          if (!canDice) return;
                          SoundFX.buyItem();
                          setRun((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  totalSpentGold: prev.totalSpentGold + 50,
                                  luckyDiceOwned: prev.luckyDiceOwned + 1,
                                }
                              : null
                          );
                          showToast('🎲 已铸造 1 枚【幸运骰】！');
                        }}
                        className={`px-3 py-2 border-2 border-[#111827] rounded-lg text-xs font-mono-num font-extrabold whitespace-nowrap ${
                          canDice
                            ? 'bg-[#38BDF8] hover:bg-[#0EA5E9] shadow-[2px_2px_0px_#111827] cursor-pointer'
                            : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {run.luckyDiceOwned >= maxDiceAllowed ? '已达上限' : '50 G 铸造'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* 12. NODE_FATE (命运层) */}
        {resolvedType === 'NODE_FATE' && (
          <div className="p-4 bg-[#F3E8FF] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#C084FC] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🔮 命运层 · 三枚矿符
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">三枚矿符悬浮在半空（三选一）</h3>
            {fateDone ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {fateDone}
              </div>
            ) : (
              <div className="space-y-2">
                {fateOptions.map((fb) => (
                  <button
                    key={fb.id}
                    onClick={() => {
                      SoundFX.buyItem();
                      setRun((prev) => {
                        if (!prev) return null;
                        const nextMaxHp = fb.id === 'fate_tenacity' ? prev.maxHp + 20 : prev.maxHp;
                        const nextHp =
                          fb.id === 'fate_tenacity' ? Math.min(nextMaxHp, prev.hp + 20) : prev.hp;
                        return {
                          ...prev,
                          maxHp: nextMaxHp,
                          hp: nextHp,
                          fateBuffs: [...prev.fateBuffs, fb.id],
                        };
                      });
                      setFateDone(`🔮 已铭刻命运矿符：【${fb.name}】(${fb.desc})`);
                    }}
                    className="w-full p-3 bg-white hover:bg-[#FFDE00] border-2 border-[#111827] rounded-xl text-left shadow-[2px_2px_0px_#111827] cursor-pointer"
                  >
                    <div className="text-xs font-extrabold text-[#111827]">✨ {fb.name}</div>
                    <div className="text-[11px] font-semibold text-[#4B5563] mt-0.5">{fb.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 13. NODE_PARASITE (寄生矿层) */}
        {resolvedType === 'NODE_PARASITE' && (
          <div className="p-5 bg-[#F3E8FF] border-3 border-[#111827] rounded-2xl text-center space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-3 py-1 bg-[#C084FC] border-2 border-[#111827] rounded-full text-xs font-extrabold">
              🦠 寄生矿层
            </span>
            <h3 className="text-lg font-extrabold text-[#111827]">紫色矿孢附着在装备上</h3>
            <p className="text-xs font-bold text-[#374151]">
              接下来每深入 1 层自动获得 <span className="text-[#059669]">+20 金币</span>，但每层扣除{' '}
              <span className="text-[#DC2626]">-3 HP</span>（最多持续 10 层；可在净化层/休整层/黑市免费移除）。
            </p>
            <div className="p-2.5 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
              寄生状态已激活：剩余 {run.parasiteFloorsLeft} 层
            </div>
          </div>
        )}

        {/* 14. NODE_RELIC (遗物层) */}
        {resolvedType === 'NODE_RELIC' && (
          <div className="p-4 bg-[#FEF9C3] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#FFDE00] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🏺 遗物层 · 古老器物
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">矿脉核心嵌着一件古老器物</h3>
            <p className="text-xs font-bold text-[#374151]">
              获得 1 件局内被动装备，且下一层额外触发超频遗物增幅（稀有矿生成率 +25%，用完一次失效）。
            </p>
            {relicDone ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {relicDone}
              </div>
            ) : (
              <button
                onClick={() => {
                  SoundFX.buyItem();
                  const unowned = GAME_CONFIG.ITEMS.filter(
                    (i) => i.type === 'equipment' && !run.equipmentIds.includes(i.id)
                  );
                  const pick =
                    unowned.length > 0
                      ? unowned[Math.floor(Math.random() * unowned.length)]
                      : GAME_CONFIG.ITEMS[0];
                  setRun((prev) =>
                    prev
                      ? {
                          ...prev,
                          equipmentIds: prev.equipmentIds.includes(pick.id)
                            ? prev.equipmentIds
                            : [...prev.equipmentIds, pick.id],
                          relicNextFloorBoost: true,
                        }
                      : null
                  );
                  setRelicDone(`🏺 获得遗物装备【${pick.name}】且下一层激活超频增幅！`);
                }}
                className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] border-3 border-[#111827] rounded-xl text-xs font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                🏺 提取古老遗物装备 + 下层增幅
              </button>
            )}
          </div>
        )}

        {/* 15. NODE_ECHO (回声层) */}
        {resolvedType === 'NODE_ECHO' && (
          <div className="p-4 bg-[#E0F2FE] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#38BDF8] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🔊 回声层 · 矿道共鸣
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">矿道重复了刚才的回声</h3>
            <p className="text-xs font-bold text-[#374151]">
              复制上一个非固定节点（{run.lastNonFixedNodeType || '普通矿层'}）的效果，奖励按 50%~100% 结算！
            </p>
            {echoDone ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {echoDone}
              </div>
            ) : (
              <button
                onClick={() => {
                  const ratio = 0.5 + Math.random() * 0.5;
                  const pct = Math.round(ratio * 100);
                  const bonusGold = Math.round(160 * ratio);
                  const bonusHp = Math.round(35 * ratio);
                  SoundFX.collectGold(bonusGold);
                  setRun((prev) =>
                    prev
                      ? {
                          ...prev,
                          totalEarnedGold: prev.totalEarnedGold + bonusGold,
                          hp: Math.min(prev.maxHp, prev.hp + bonusHp),
                        }
                      : null
                  );
                  setEchoDone(`🔊 共鸣度 ${pct}%！回声反馈了 +${bonusGold}G 与 +${bonusHp} HP！`);
                }}
                className="w-full py-3 bg-[#38BDF8] hover:bg-[#0EA5E9] border-3 border-[#111827] rounded-xl text-xs font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                🔊 聆听回声 · 领取共鸣奖励
              </button>
            )}
          </div>
        )}

        {/* 16. NODE_CONTRACT (矿灵契约) */}
        {resolvedType === 'NODE_CONTRACT' && (
          <div className="p-4 bg-[#DCFCE7] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#4ADE80] border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              📜 矿灵契约
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">矿灵在耳边低语</h3>
            <p className="text-xs font-bold text-[#374151]">
              签订契约后：接下来每深入 1 层额外获得 <span className="text-[#059669]">+30 金币</span> 且抓矿回收速度{' '}
              <span className="text-[#0284C7]">+15%</span>；但若探险失败结算，带回金币将归零！
            </p>
            {run.contractSigned ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold text-[#059669]">
                📜 已签订矿灵契约！每层 +30G 且抓矿回收速度 +15%！
              </div>
            ) : (
              <button
                onClick={() => {
                  SoundFX.buyItem();
                  setRun((prev) => (prev ? { ...prev, contractSigned: true } : null));
                  showToast('📜 已签订【矿灵契约】！');
                }}
                className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] border-3 border-[#111827] rounded-xl text-xs font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                ✍️ 签订矿灵契约 (每层+30G · 抓矿+15%)
              </button>
            )}
          </div>
        )}

        {/* 17. NODE_TRAP (陷阱层) */}
        {resolvedType === 'NODE_TRAP' && (
          <div className="p-4 bg-[#FFE4E6] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#FB7185] text-white border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🪤 疑似伪装节点 · 真相揭晓
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">这只宝箱看起来太新了</h3>
            <p className="text-xs font-bold text-[#374151]">
              20% 概率是真宝箱（获得高额金币），80% 概率触发伪装陷阱（扣 HP / 丢少许金币 / 遭遇精英守卫）。
            </p>
            {trapResolved ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold">
                {trapResolved}
              </div>
            ) : (
              <button
                onClick={() => {
                  const roll = Math.random();
                  if (roll < 0.2) {
                    SoundFX.collectGold(240);
                    setRun((prev) =>
                      prev ? { ...prev, totalEarnedGold: prev.totalEarnedGold + 240 } : null
                    );
                    setTrapResolved('🎉 惊喜！竟然是 20% 概率的【真·黄金宝箱】，获得 +240 金币！');
                  } else if (roll < 0.55) {
                    SoundFX.hitObstacle(false);
                    const nextHp = Math.max(1, run.hp - 15);
                    setRun((prev) => (prev ? { ...prev, hp: nextHp } : null));
                    setTrapResolved('💥 触发捕兽夹陷阱！扣除 15 HP！');
                  } else if (roll < 0.8) {
                    SoundFX.hitObstacle(false);
                    const lost = Math.min(availableGold, 80);
                    setRun((prev) =>
                      prev ? { ...prev, totalSpentGold: prev.totalSpentGold + lost } : null
                    );
                    setTrapResolved(`💸 宝箱里跳出盗金地精，抢走了 ${lost} 金币！`);
                  } else {
                    setResolvedType('NODE_ELITE');
                  }
                }}
                className="w-full py-3 bg-[#FFDE00] hover:bg-[#FACC15] border-3 border-[#111827] rounded-xl text-xs font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                🔍 检视前方伪装物
              </button>
            )}
          </div>
        )}

        {/* 18. NODE_WARP (深层传送层) */}
        {resolvedType === 'NODE_WARP' && (
          <div className="p-4 bg-[#E0F2FE] border-3 border-[#111827] rounded-2xl space-y-3 shadow-[5px_5px_0px_#111827]">
            <span className="inline-block px-2.5 py-0.5 bg-[#06B6D4] text-white border-2 border-[#111827] rounded-lg text-xs font-extrabold">
              🚀 深层传送层
            </span>
            <h3 className="text-base font-extrabold text-[#111827]">矿车轨道通向未知深度</h3>
            <p className="text-xs font-bold text-[#374151]">
              乘坐高速矿车可向前跳跃 1~3 深度（智能制动：绝不会跳过 10 倍数存档层与 30 倍数奖励矿床！）。
            </p>
            {warpDelta !== null ? (
              <div className="p-3 bg-white border-2 border-[#111827] rounded-xl text-xs font-extrabold text-[#0369A1]">
                🚀 传送轨道已锁定：即将向前跃迁 +{warpDelta} 深度！
              </div>
            ) : (
              <button
                onClick={() => {
                  SoundFX.buyItem();
                  const rawJump = Math.floor(Math.random() * 3) + 1;
                  // Clamp so we never skip a multiple of 10 checkpoint or 30 bonus mine!
                  const nextMilestone = Math.ceil((run.depth + 1) / 10) * 10;
                  const maxSafeJump = Math.max(1, nextMilestone - run.depth);
                  const safeJump = Math.min(rawJump, maxSafeJump);
                  setWarpDelta(safeJump);
                }}
                className="w-full py-3 bg-[#38BDF8] hover:bg-[#0EA5E9] border-3 border-[#111827] rounded-xl text-xs font-extrabold shadow-[3px_3px_0px_#111827] cursor-pointer"
              >
                🚀 启动深层传送轨道 (跳跃 1~3 深度)
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => onFinishSpecialNode(warpDelta ?? 1)}
        className="w-full py-3.5 bg-[#4ADE80] hover:bg-[#22C55E] text-[#111827] border-3 border-[#111827] text-sm font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer mt-3"
      >
        完成本层事件 → 选择下一深度路线
      </button>
    </div>
  );
};
