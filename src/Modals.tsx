import React from 'react';
import {
  GAME_CONFIG,
  WeatherConfig,
} from './gameConfig';
import {
  SaveSystem,
  PersistentSaveData,
  WardrobeSystem,
  WeatherSystem,
  CheckpointSystem,
  RunState,
  RandomSystem,
  RouteNodeType,
} from './systems';
import { SoundFX } from './sound';

// ============================================================================
// DEBUG / TESTING MODE PANEL COMPONENT (Memphis Style + All 19 Nodes)
// ============================================================================
export interface DebugPanelProps {
  run: RunState | null;
  setRun: React.Dispatch<React.SetStateAction<RunState | null>>;
  saveData: PersistentSaveData;
  updateSave: (updater: (prev: PersistentSaveData) => PersistentSaveData) => void;
  onForceExtract: () => void;
  onForceFail: () => void;
  onNextDepth: () => void;
  onForceNode: (type: RouteNodeType) => void;
  showToast: (msg: string) => void;
}

export const DebugPanelContent: React.FC<DebugPanelProps> = ({
  run,
  setRun,
  updateSave,
  onForceExtract,
  onForceFail,
  onNextDepth,
  onForceNode,
  showToast,
}) => {
  const allWeathers: WeatherConfig[] = [
    ...GAME_CONFIG.BASE_WEATHERS,
    ...GAME_CONFIG.SPECIAL_COMBO_WEATHERS,
  ];

  const debugSpecialNodes: { type: RouteNodeType; label: string; color: string }[] = [
    { type: 'NODE_HEAL_50', label: '💚 回复50层', color: 'bg-[#4ADE80]' },
    { type: 'NODE_HEAL_FULL', label: '💖 回满层', color: 'bg-[#4ADE80]' },
    { type: 'NODE_PURGE', label: '💧 净化层', color: 'bg-[#2DD4BF]' },
    { type: 'NODE_CHEST', label: '📦 宝箱层', color: 'bg-[#FFDE00]' },
    { type: 'NODE_RELIC', label: '🏺 遗物层', color: 'bg-[#FFDE00]' },
    { type: 'NODE_ECHO', label: '🔊 回声层', color: 'bg-[#38BDF8]' },
    { type: 'NODE_BLACK_MARKET', label: '🕵️ 黑市层', color: 'bg-[#C084FC]' },
    { type: 'NODE_FORGE', label: '🔨 锻造层', color: 'bg-[#FB923C]' },
    { type: 'NODE_SACRIFICE', label: '🩸 献祭层', color: 'bg-[#FF6B6B] text-white' },
    { type: 'NODE_GAMBLE', label: '🎲 赌徒矿层', color: 'bg-[#FB923C]' },
    { type: 'NODE_CURSE', label: '🕸️ 诅咒矿层', color: 'bg-[#C084FC]' },
    { type: 'NODE_PARASITE', label: '🦠 寄生矿层', color: 'bg-[#C084FC]' },
    { type: 'NODE_CONTRACT', label: '📜 矿灵契约', color: 'bg-[#4ADE80]' },
    { type: 'NODE_ELITE', label: '⚔️ 精英守卫', color: 'bg-[#FF6B6B] text-white' },
    { type: 'NODE_COLLAPSE', label: '🪨 塌方层', color: 'bg-[#FF6B6B] text-white' },
    { type: 'NODE_TRAP', label: '🪤 陷阱层', color: 'bg-[#FB7185]' },
    { type: 'NODE_UNKNOWN', label: '❓ 未知层', color: 'bg-[#38BDF8]' },
    { type: 'NODE_FATE', label: '🔮 命运层', color: 'bg-[#C084FC]' },
    { type: 'NODE_WARP', label: '🚀 深层传送', color: 'bg-[#38BDF8]' },
    { type: 'NODE_REWARD_MINE', label: '💎 奖励矿床', color: 'bg-[#FFDE00]' },
  ];

  return (
    <div className="space-y-3 text-xs text-[#111827]">
      <div className="flex items-center justify-between bg-[#FFDE00] border-2 border-[#111827] px-2.5 py-1.5 rounded-lg shadow-[2px_2px_0px_#111827]">
        <span className="font-extrabold text-[#111827]">🛠️ 开发者数值与节点测试台</span>
        <span className="text-[11px] font-bold font-mono-num">
          {run ? `深度 ${run.depth} | 普通层#${run.normalFloorCount}` : '未在局内'}
        </span>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => {
            updateSave((prev) => ({ ...prev, permanentGold: prev.permanentGold + 1000 }));
            if (run) {
              setRun((prev) =>
                prev ? { ...prev, totalEarnedGold: prev.totalEarnedGold + 1000 } : null
              );
            }
            showToast('🛠️ Debug: 金币 +1000G');
          }}
          className="py-2 px-2.5 bg-[#FFDE00] border-2 border-[#111827] rounded-lg text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          +1000 金币
        </button>

        <button
          onClick={() => {
            if (run) {
              setRun((prev) => (prev ? { ...prev, hp: prev.maxHp } : null));
              showToast('🛠️ Debug: HP 已恢复满');
            } else {
              showToast('请先进入探险！');
            }
          }}
          className="py-2 px-2.5 bg-[#4ADE80] border-2 border-[#111827] rounded-lg text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          恢复满 HP
        </button>

        <button
          onClick={onNextDepth}
          className="py-2 px-2.5 bg-[#38BDF8] border-2 border-[#111827] rounded-lg text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          进入下一深度
        </button>

        <button
          onClick={() => {
            if (run) {
              setRun((prev) =>
                prev ? { ...prev, checkpoint: CheckpointSystem.createSnapshot(prev) } : null
              );
              showToast('🛠️ Debug: 已在当前深度强制生成存档点');
            }
          }}
          className="py-2 px-2.5 bg-[#C084FC] border-2 border-[#111827] rounded-lg text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          立即生成存档点
        </button>

        <button
          onClick={() => {
            if (run) onForceExtract();
            else showToast('请先进入探险！');
          }}
          className="py-2 px-2.5 bg-[#4ADE80] border-2 border-[#111827] rounded-lg text-[#111827] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          强制撤离结算
        </button>

        <button
          onClick={() => {
            if (run) onForceFail();
            else showToast('请先进入探险！');
          }}
          className="py-2 px-2.5 bg-[#FF6B6B] border-2 border-[#111827] rounded-lg text-white font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          强制失败结算
        </button>
      </div>

      {/* Force Biome Selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-extrabold text-[#111827] block">强制切换当前矿区：</label>
        <select
          value={run?.currentBiome.id || 'plains'}
          onChange={(e) => {
            const biome = GAME_CONFIG.BIOMES.find((b) => b.id === e.target.value);
            if (biome && run) {
              const rng = new RandomSystem(`${run.runSeed}::force-${Date.now()}`);
              const wRoll = WeatherSystem.rollWeatherForBiome(rng, biome);
              setRun((prev) =>
                prev
                  ? {
                      ...prev,
                      currentBiome: biome,
                      baseWeather: wRoll.baseWeather,
                      finalWeather: wRoll.finalWeather,
                    }
                  : null
              );
              showToast(`🛠️ 已切换矿区为【${biome.name}】`);
            }
          }}
          className="w-full px-2.5 py-1.5 bg-white border-2 border-[#111827] rounded-lg text-[#111827] font-bold text-xs shadow-[2px_2px_0px_#111827]"
        >
          {GAME_CONFIG.BIOMES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.subtitle}
            </option>
          ))}
        </select>
      </div>

      {/* Force Weather Selector */}
      <div className="space-y-1">
        <label className="text-[11px] font-extrabold text-[#111827] block">
          强制切换天气 (含14基础 + 15特殊联动)：
        </label>
        <select
          value={run?.finalWeather.id || 'sunny'}
          onChange={(e) => {
            const wCfg = allWeathers.find((w) => w.id === e.target.value);
            if (wCfg && run) {
              setRun((prev) =>
                prev ? { ...prev, baseWeather: wCfg, finalWeather: wCfg } : null
              );
              showToast(`🛠️ 已强制天气为【${wCfg.name}】`);
            }
          }}
          className="w-full px-2.5 py-1.5 bg-white border-2 border-[#111827] rounded-lg text-[#111827] font-bold text-xs shadow-[2px_2px_0px_#111827]"
        >
          <optgroup label="14种基础天气">
            {GAME_CONFIG.BASE_WEATHERS.map((w) => (
              <option key={w.id} value={w.id}>
                [基础] {w.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="15种特殊联动天气">
            {GAME_CONFIG.SPECIAL_COMBO_WEATHERS.map((w) => (
              <option key={w.id} value={w.id}>
                [⚡联动] {w.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Force All 18 Special Nodes */}
      <div className="space-y-1">
        <label className="text-[11px] font-extrabold text-[#111827] block">
          强制进入任意特殊节点 (18种全覆盖)：
        </label>
        <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
          {debugSpecialNodes.map((n) => (
            <button
              key={n.type}
              onClick={() => onForceNode(n.type)}
              className={`py-1.5 px-1.5 ${n.color} border-2 border-[#111827] rounded-lg text-[11px] font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer`}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reset Persistent Save */}
      <div className="pt-2 border-t-2 border-[#111827]">
        <button
          onClick={() => {
            const fresh = SaveSystem.reset();
            updateSave(() => fresh);
            showToast('🛠️ 已重置本地永久存档 (localStorage)');
          }}
          className="w-full py-2 bg-[#FF6B6B] border-2 border-[#111827] text-white rounded-lg font-extrabold shadow-[2px_2px_0px_#111827] whitespace-nowrap cursor-pointer"
        >
          重置永久存档 (Reset Save)
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// META SCREENS: HOME, WARDROBE, MALL, ADVENTURERS, COLLECTION (Memphis Style)
// ============================================================================
export interface MetaScreenProps {
  saveData: PersistentSaveData;
  updateSave: (updater: (prev: PersistentSaveData) => PersistentSaveData) => void;
  onBack: () => void;
  onGoCharSelect?: () => void;
  showToast: (msg: string) => void;
}

export const HomeView: React.FC<MetaScreenProps> = ({
  saveData,
  updateSave,
  onBack,
  showToast,
}) => (
  <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
    <div className="flex items-center justify-between p-3 bg-[#FFDE00] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827]">
      <div>
        <h2 className="text-base font-extrabold text-[#111827]">🏠 家园研发工坊</h2>
        <p className="text-[11px] font-bold text-[#111827]/80">
          升级设备解锁 6 件强力局内装备进入商店池（不加面板）
        </p>
      </div>
      <div className="text-right font-mono-num bg-white border-2 border-[#111827] px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827]">
        <div className="text-[10px] font-bold text-[#111827]">永久金币</div>
        <div className="text-sm font-extrabold text-[#D97706]">{saveData.permanentGold} G</div>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto my-3 space-y-3 pr-1">
      {GAME_CONFIG.HOME_DEVICES.map((dev, idx) => {
        const curLv = saveData.homeLevels[dev.id] || 0;
        const headerBg = idx === 0 ? 'bg-[#38BDF8]' : idx === 1 ? 'bg-[#4ADE80]' : 'bg-[#C084FC]';
        return (
          <div
            key={dev.id}
            className="p-3.5 bg-white border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-extrabold text-[#111827] ${headerBg} border-2 border-[#111827] px-2.5 py-0.5 rounded-lg shadow-[2px_2px_0px_#111827]`}
              >
                {dev.name}
              </span>
              <span className="text-xs font-mono-num font-extrabold text-[#111827] bg-[#FFDE00] border-2 border-[#111827] px-2 py-0.5 rounded">
                Lv.{curLv} / 2
              </span>
            </div>
            <p className="text-xs font-semibold text-[#374151]">{dev.desc}</p>

            <div className="space-y-2 pt-1">
              {dev.levels.map((lvObj) => {
                const isUnlocked = curLv >= lvObj.level;
                const isNext = curLv + 1 === lvObj.level;
                const canAfford = saveData.permanentGold >= lvObj.cost;

                return (
                  <div
                    key={lvObj.level}
                    className={`p-2.5 rounded-lg border-2 border-[#111827] text-xs flex items-center justify-between gap-2 ${
                      isUnlocked ? 'bg-[#DCFCE7]' : 'bg-[#FFFDF7]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-extrabold text-[#111827]">
                        Lv.{lvObj.level} 解锁：【{lvObj.unlockItemName}】
                      </div>
                      <div className="text-[11px] font-semibold text-[#4B5563]">{lvObj.unlockDesc}</div>
                    </div>

                    <button
                      disabled={isUnlocked || !isNext || !canAfford}
                      onClick={() => {
                        if (isUnlocked || !isNext || !canAfford) return;
                        SoundFX.buyItem();
                        updateSave((prev) => ({
                          ...prev,
                          permanentGold: prev.permanentGold - lvObj.cost,
                          homeLevels: {
                            ...prev.homeLevels,
                            [dev.id]: lvObj.level,
                          },
                        }));
                        showToast(`🏠 已升级 ${dev.name} Lv.${lvObj.level}，解锁【${lvObj.unlockItemName}】！`);
                      }}
                      className={`px-3 py-1.5 rounded-lg border-2 border-[#111827] font-mono-num font-extrabold whitespace-nowrap shrink-0 ${
                        isUnlocked
                          ? 'bg-[#4ADE80] text-[#111827]'
                          : isNext && canAfford
                          ? 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {isUnlocked ? '已解锁' : `${lvObj.cost} G`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>

    <button
      onClick={onBack}
      className="w-full py-3 bg-[#FF6B6B] hover:bg-[#EF4444] text-white border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
    >
      返回主界面
    </button>
  </div>
);

export const WardrobeView: React.FC<MetaScreenProps> = ({
  saveData,
  updateSave,
  onBack,
  showToast,
}) => (
  <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
    <div className="flex items-center justify-between p-3 bg-[#C084FC] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827]">
      <div>
        <h2 className="text-base font-extrabold text-[#111827]">👕 矿工衣柜换装</h2>
        <p className="text-[11px] font-bold text-[#111827]/80">换装只改变矿工外观，不增加任何局内数值</p>
      </div>
      <div className="font-mono-num text-xs font-extrabold bg-[#FFDE00] border-2 border-[#111827] px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827]">
        {saveData.permanentGold} G
      </div>
    </div>

    <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
      {GAME_CONFIG.COSTUMES.map((cos) => {
        const unlocked = saveData.unlockedCostumes.includes(cos.id);
        const equipped = saveData.equippedCostumeId === cos.id;
        const shardsOwned = saveData.costumeShards[cos.id] || 0;
        const canBuyGold = WardrobeSystem.canUnlockWithGold(saveData, cos.id);
        const canCraftShards = WardrobeSystem.canCraftWithShards(saveData, cos.id);

        return (
          <div
            key={cos.id}
            className="p-3 bg-white border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-lg border-3 border-[#111827] shrink-0 flex items-center justify-center shadow-[2px_2px_0px_#111827]"
                style={{
                  backgroundColor: cos.suitColor,
                }}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 border-[#111827]"
                  style={{ backgroundColor: cos.capeColor }}
                />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold text-[#111827] flex items-center gap-2">
                  <span>{cos.name}</span>
                  {cos.shardsRequired > 0 && !unlocked && (
                    <span className="text-[10px] font-mono-num font-bold bg-[#F3E8FF] border border-[#111827] px-1.5 py-0.5 rounded">
                      碎片 {shardsOwned}/{cos.shardsRequired}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold text-[#4B5563]">{cos.desc}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 shrink-0">
              {unlocked ? (
                <button
                  onClick={() => {
                    updateSave((prev) => ({ ...prev, equippedCostumeId: cos.id }));
                    showToast(`已穿戴【${cos.name}】`);
                  }}
                  className={`px-3 py-1.5 rounded-lg border-2 border-[#111827] text-xs font-extrabold whitespace-nowrap shadow-[2px_2px_0px_#111827] ${
                    equipped
                      ? 'bg-[#4ADE80] text-[#111827]'
                      : 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] cursor-pointer'
                  }`}
                >
                  {equipped ? '✓ 穿戴中' : '穿戴'}
                </button>
              ) : (
                <>
                  <button
                    disabled={!canBuyGold}
                    onClick={() => {
                      if (!canBuyGold) return;
                      SoundFX.buyItem();
                      updateSave((prev) => ({
                        ...prev,
                        permanentGold: prev.permanentGold - cos.priceGold,
                        unlockedCostumes: [...prev.unlockedCostumes, cos.id],
                        equippedCostumeId: cos.id,
                      }));
                      showToast(`🎉 已解锁并穿戴【${cos.name}】！`);
                    }}
                    className={`px-2.5 py-1 rounded-lg border-2 border-[#111827] text-[11px] font-mono-num font-extrabold whitespace-nowrap ${
                      canBuyGold
                        ? 'bg-[#FFDE00] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {cos.priceGold}G 购买
                  </button>
                  {cos.shardsRequired > 0 && (
                    <button
                      disabled={!canCraftShards}
                      onClick={() => {
                        if (!canCraftShards) return;
                        SoundFX.buyItem();
                        updateSave((prev) => ({
                          ...prev,
                          unlockedCostumes: [...prev.unlockedCostumes, cos.id],
                          equippedCostumeId: cos.id,
                        }));
                        showToast(`✨ 使用碎片合成了【${cos.name}】！`);
                      }}
                      className={`px-2.5 py-1 rounded-lg border-2 border-[#111827] text-[11px] font-extrabold whitespace-nowrap ${
                        canCraftShards
                          ? 'bg-[#C084FC] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      碎片合成
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>

    <button
      onClick={onBack}
      className="w-full py-3 bg-[#FF6B6B] hover:bg-[#EF4444] text-white border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
    >
      返回主界面
    </button>
  </div>
);

export const MallView: React.FC<MetaScreenProps> = ({
  saveData,
  updateSave,
  onBack,
  showToast,
}) => (
  <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
    <div className="flex items-center justify-between p-3 bg-[#38BDF8] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827]">
      <div>
        <h2 className="text-base font-extrabold text-[#111827]">🛒 营地常驻商城</h2>
        <p className="text-[11px] font-bold text-[#111827]/80">使用永久金币采购服装碎片补齐衣柜</p>
      </div>
      <div className="font-mono-num text-xs font-extrabold bg-[#FFDE00] border-2 border-[#111827] px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827]">
        {saveData.permanentGold} G
      </div>
    </div>

    <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
      {GAME_CONFIG.COSTUMES.filter((c) => c.shardsRequired > 0).map((cos) => {
        const shardPrice = 180;
        const canAfford = saveData.permanentGold >= shardPrice;
        const owned = saveData.costumeShards[cos.id] || 0;
        const isUnlocked = saveData.unlockedCostumes.includes(cos.id);

        return (
          <div
            key={cos.id}
            className="p-3.5 bg-white border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] flex items-center justify-between gap-3"
          >
            <div>
              <div className="text-sm font-extrabold text-[#111827]">{cos.name} · 专属碎片</div>
              <div className="text-xs font-bold text-[#4B5563]">
                当前持有：{owned} / {cos.shardsRequired} 片
              </div>
            </div>
            <button
              disabled={isUnlocked || !canAfford}
              onClick={() => {
                if (isUnlocked || !canAfford) return;
                SoundFX.buyItem();
                updateSave((prev) => ({
                  ...prev,
                  permanentGold: prev.permanentGold - shardPrice,
                  costumeShards: {
                    ...prev.costumeShards,
                    [cos.id]: (prev.costumeShards[cos.id] || 0) + 1,
                  },
                }));
                showToast(`购入 1 片【${cos.name}】碎片！`);
              }}
              className={`px-3.5 py-2 rounded-lg border-2 border-[#111827] text-xs font-mono-num font-extrabold whitespace-nowrap ${
                isUnlocked
                  ? 'bg-[#4ADE80] text-[#111827]'
                  : canAfford
                  ? 'bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] shadow-[2px_2px_0px_#111827] cursor-pointer'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isUnlocked ? '服装已拥有' : `${shardPrice} G / 片`}
            </button>
          </div>
        );
      })}
    </div>

    <button
      onClick={onBack}
      className="w-full py-3 bg-[#FF6B6B] hover:bg-[#EF4444] text-white border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
    >
      返回主界面
    </button>
  </div>
);

export const AdventurersView: React.FC<MetaScreenProps> = ({
  onBack,
  onGoCharSelect,
}) => (
  <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
    <div className="p-3 bg-[#4ADE80] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827]">
      <h2 className="text-base font-extrabold text-[#111827]">⛏️ 冒险者协会名册 (7名全开放)</h2>
      <p className="text-[11px] font-bold text-[#111827]/80">
        无需金币解锁、无角色等级压制，每名角色提供独特的抓矿战术规则
      </p>
    </div>

    <div className="flex-1 overflow-y-auto my-3 space-y-2.5 pr-1">
      {GAME_CONFIG.CHARACTERS.map((char) => (
        <div
          key={char.id}
          className="p-3 bg-white border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827] space-y-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-[#111827]">{char.name}</span>
            <span className="text-xs font-extrabold bg-[#FFDE00] border-2 border-[#111827] px-2 py-0.5 rounded">
              {char.title}
            </span>
          </div>
          <p className="text-xs font-semibold text-[#111827] leading-relaxed">{char.ruleDesc}</p>
          <p className="text-[11px] font-bold text-[#059669]">{char.tacticalHint}</p>
        </div>
      ))}
    </div>

    <div className="flex gap-2">
      <button
        onClick={onGoCharSelect}
        className="flex-1 py-3 bg-[#FFDE00] hover:bg-[#FACC15] text-[#111827] border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
      >
        选择角色出发
      </button>
      <button
        onClick={onBack}
        className="px-5 py-3 bg-[#FF6B6B] hover:bg-[#EF4444] text-white border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
      >
        返回
      </button>
    </div>
  </div>
);

export const CollectionView: React.FC<MetaScreenProps> = ({
  saveData,
  onBack,
}) => (
  <div className="flex-1 flex flex-col justify-between p-4 bg-[#FFFDF7] memphis-dots overflow-hidden">
    <div className="p-3 bg-[#FFDE00] border-3 border-[#111827] rounded-xl shadow-[4px_4px_0px_#111827]">
      <h2 className="text-base font-extrabold text-[#111827]">📖 探险藏品与天气联动图鉴</h2>
      <p className="text-[11px] font-bold text-[#111827]/80">
        当特定矿区遭遇对应基础天气时，基础天气将完全替换为特殊联动天气
      </p>
    </div>

    <div className="flex-1 overflow-y-auto my-3 space-y-4 pr-1">
      <div>
        <h3 className="text-xs font-extrabold text-[#111827] bg-[#38BDF8] border-2 border-[#111827] inline-block px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827] mb-2">
          ⚡ 15 种特殊天气联动配方
        </h3>
        <div className="space-y-2">
          {GAME_CONFIG.SPECIAL_COMBO_WEATHERS.map((cw) => (
            <div
              key={cw.id}
              className="p-2.5 bg-white border-2 border-[#111827] rounded-xl shadow-[3px_3px_0px_#111827] text-xs"
            >
              <div className="font-extrabold text-[#111827] mb-0.5">{cw.name}</div>
              <div className="font-semibold text-[#374151]">{cw.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-extrabold text-[#111827] bg-[#4ADE80] border-2 border-[#111827] inline-block px-2.5 py-1 rounded-lg shadow-[2px_2px_0px_#111827] mb-2">
          🗺️ 15 大矿区生态 ({saveData.discoveredBiomes.length}/{GAME_CONFIG.BIOMES.length})
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {GAME_CONFIG.BIOMES.map((b) => (
            <div
              key={b.id}
              className="p-2.5 bg-white border-2 border-[#111827] rounded-xl shadow-[3px_3px_0px_#111827] text-xs"
            >
              <div className="font-extrabold text-[#111827]">{b.name}</div>
              <div className="text-[11px] font-semibold text-[#4B5563]">{b.subtitle}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <button
      onClick={onBack}
      className="w-full py-3 bg-[#FF6B6B] hover:bg-[#EF4444] text-white border-3 border-[#111827] text-xs font-extrabold rounded-xl shadow-[4px_4px_0px_#111827] whitespace-nowrap cursor-pointer"
    >
      返回主界面
    </button>
  </div>
);
