/**
 * Contextual coaching. Pure logic: given the current campaign state, name the
 * single next action the player should take, and why.
 *
 * This is deliberately not a step-by-step script. It reads live state and
 * answers one question — "what do I press right now?" — so it stays correct
 * no matter which order the player actually does things in.
 *
 * Every city exposes the same shape of progress: a phase, a set of collected
 * evidence ids, and a set of completed cases. The coach reads those and
 * answers for whichever city is currently loaded.
 */

export interface CoachStep {
  /** The key (or key group) to press. */
  key: string;
  /** What pressing it does. */
  label: string;
  /** Why that is the next thing, and what to look for. */
  hint: string;
}

export type City = 'dock' | 'forge' | 'thread' | 'snow' | 'dune';

export interface DockContext {
  city: 'dock';
  chapter: 'meet' | 'reorder' | 'rail' | 'board' | 'complete';
  evidence: readonly string[];
}

export interface ForgeContext {
  city: 'forge';
  phase: 'arrival' | 'climate' | 'carry' | 'exit' | 'complete';
  evidence: readonly string[];
}

export interface ThreadContext {
  city: 'thread';
  phase: 'arrival' | 'locks' | 'schedule' | 'counter' | 'memory' | 'audit' | 'evacuate' | 'complete';
  evidence: readonly string[];
}

export interface SnowContext {
  city: 'snow';
  phase: 'arrival' | 'wind' | 'route' | 'reliable' | 'congestion' | 'clock' | 'audit' | 'expedition' | 'complete';
  evidence: readonly string[];
  /** Deliveries completed so far; only meaningful during the expedition. */
  delivery?: number;
}

export interface DuneContext {
  city: 'dune';
  phase: 'arrival' | 'stock' | 'billing' | 'snapshot' | 'recovery'
    | 'migration' | 'outbox' | 'audit' | 'rehearsal' | 'descent' | 'complete';
  evidence: readonly string[];
  /** Cases already repaired; side incidents can be revisited after the main line. */
  completed: readonly string[];
}

export type CoachContext = DockContext | ForgeContext | ThreadContext | SnowContext | DuneContext;

/* ------------------------------------------------------------------ 指针港 */

function dockCoach(ctx: DockContext): CoachStep | null {
  const { chapter, evidence } = ctx;
  if (chapter === 'meet') {
    return {
      key: 'W A S D',
      label: '沿港口灯带向前走',
      hint: 'MIRA 在前方雨棚下。靠近后按 E 与她对话。',
    };
  }
  if (chapter === 'reorder') {
    return evidence.includes('Q-01')
      ? {
        key: 'E',
        label: '打断点，改写事件顺序',
        hint: '证据已到手。按 E 冻结这段时空，打开因果工作台。',
      }
      : {
        key: 'Q',
        label: '扫描坏站台取证',
        hint: '站台在旅客离开前就消失了。靠近后按 Q 采集证据。',
      };
  }
  if (chapter === 'rail') {
    return evidence.includes('DS-01')
      ? {
        key: 'E',
        label: '打断点，重连失联线路',
        hint: 'B 站没有任何停靠记录。按 E 检查列车的下一站指针。',
      }
      : {
        key: 'Q',
        label: '扫描列车运行轨迹',
        hint: '沿维修桥和坡道走上高架层，到 A 站后按 Q。',
      };
  }
  if (chapter === 'board') {
    return {
      key: 'E',
      label: '登上返航列车',
      hint: '回到 A 站，站到列车旁按 E。',
    };
  }
  return {
    key: 'E',
    label: '乘城际列车前往脉冲炉',
    hint: '指针港已恢复。到 END 站按 E，或点下方「乘城际列车出发」。',
  };
}

/* ------------------------------------------------------------------ 脉冲炉 */

function forgeCoach(ctx: ForgeContext): CoachStep | null {
  const { phase, evidence } = ctx;
  if (phase === 'arrival') {
    return {
      key: 'W A S D',
      label: '找到 K-13',
      hint: '沿灯带向前，热工区的操作员在前方。靠近后按 E。',
    };
  }
  if (phase === 'climate') {
    return evidence.includes('WF-01')
      ? {
        key: 'E',
        label: '打开集电台工作台',
        hint: '证据已到手。先蓄能到 80% 以上并关闭隔离闸，再切到雨天降温。',
      }
      : {
        key: 'Q',
        label: '扫描集电台',
        hint: '靠近集电台按 Q，读出它的供电与散热规则。',
      };
  }
  if (phase === 'carry') {
    return evidence.includes('CO-01')
      ? {
        key: 'E',
        label: '检查进位接线',
        hint: '证据已到手。按 E 打开失忆电梯的接线面板。',
      }
      : {
        key: 'Q',
        label: '扫描失忆电梯',
        hint: '靠近电梯按 Q，捕获它丢失的那次进位。',
      };
  }
  if (phase === 'exit') {
    return {
      key: 'E',
      label: '乘进位升降台',
      hint: '走到升降台旁按 E，登上塔顶完成本城。',
    };
  }
  return {
    key: 'E',
    label: '乘城际列车前往千线程',
    hint: '脉冲炉已恢复。乘升降台到塔顶后，按城际列车出发。',
  };
}

/* ------------------------------------------------------------------ 千线程 */

/**
 * Which case each phase puts in front of the player. The main cases are
 * sequential: the phase advances only when a case is completed, so the
 * current case — not "the first uncollected one" — decides what to do next.
 */
const THREAD_CASE_FOR_PHASE: Record<string, string> = {
  locks: 'OS-01', schedule: 'OS-02', counter: 'OS-03', memory: 'OS-04',
};
const SNOW_CASE_FOR_PHASE: Record<string, string> = {
  wind: 'WF-02', route: 'NET-01', reliable: 'NET-02', congestion: 'NET-03', clock: 'NET-04',
};

function threadCoach(ctx: ThreadContext): CoachStep | null {
  const { phase, evidence } = ctx;
  if (phase === 'arrival') {
    return {
      key: 'W A S D',
      label: '找到调度员 IRIS',
      hint: '沿蓝白灯带向前。IRIS 在塔底，靠近后按 E。',
    };
  }
  if (phase === 'evacuate') {
    return {
      key: 'E',
      label: '乘双线疏散列车',
      hint: '到双线列车站按 E，乘车穿过恢复运行的高塔。',
    };
  }
  if (phase === 'complete') {
    return {
      key: 'M',
      label: '打开任务册，乘城际列车',
      hint: '千线程已恢复。任务册底部可前往白噪雪原。',
    };
  }
  const current=THREAD_CASE_FOR_PHASE[phase];
  if(current&&!evidence.includes(current)) {
    return {
      key: 'Q',
      label: '扫描当前开放的设备',
      hint: '每个关卡都要先按 Q 采集原始证据，才能改写它的因果。',
    };
  }
  if (phase === 'audit') {
    return {
      key: 'E',
      label: '执行四系统综合回归',
      hint: '证据已齐。到 WAIT-FOR-∞ 控制台按 E，一次性验证四处修复。',
    };
  }
  return {
    key: 'E',
    label: '打断点，改写因果',
    hint: '证据已到手。按 E 打开工作台，改写当前关卡的因果规则。',
  };
}

/* ------------------------------------------------------------------ 白噪雪原 */

function snowCoach(ctx: SnowContext): CoachStep | null {
  const { phase, evidence, delivery } = ctx;
  if (phase === 'arrival') {
    return {
      key: 'W A S D',
      label: '找到雪原信使 KESTREL',
      hint: '沿橙色旗标向前。信使在风雪里，靠近后按 E。',
    };
  }
  if (phase === 'expedition') {
    return {
      key: 'F',
      label: `按住 F 稳身 · 交接 ${(delivery ?? 0) + 1}/3`,
      hint: '横风会把你推离承重面。按住 F 或点「稳身」，沿橙旗走到下一个避风站按 E。',
    };
  }
  if (phase === 'complete') {
    return {
      key: 'M',
      label: '打开勘测册',
      hint: '白噪雪原已恢复。五城的修复记录都已保留。',
    };
  }
  // The five main relays each need their own evidence scanned before editing.
  const current=SNOW_CASE_FOR_PHASE[phase];
  if(current&&!evidence.includes(current)) {
    return {
      key: 'Q',
      label: '扫描当前开放的中继设备',
      hint: '五处中继各有一份原始证据。按 Q 捕获当前这处，再按 E 改写它的因果。',
    };
  }
  if (phase === 'audit') {
    return {
      key: 'E',
      label: '执行五系统综合回归',
      hint: '证据已齐。到总中继台按 E，一次性验证全部五处修复。',
    };
  }
  return {
    key: 'E',
    label: '打断点，改写因果',
    hint: '证据已到手。按 E 打开工作台，改写当前中继的规则。',
  };
}

/* --------------------------------------------------------- 镜库城 · 赤砂档案海 */

// The six main incidents are sequential: the phase only advances once the
// current one is repaired, so the phase — not "the first unscanned case" —
// decides which device the player should be looking at.
const DUNE_CASE_FOR_PHASE = {
  stock: 'DB-01', billing: 'DB-02', snapshot: 'DB-03',
  recovery: 'DB-04', migration: 'DB-05', outbox: 'DB-06',
} as const;

function duneCoach(ctx: DuneContext): CoachStep | null {
  const { phase, evidence } = ctx;
  if (phase === 'arrival') {
    return {
      key: 'W A S D',
      label: '找到值班人 NOOR',
      hint: '左前方是还没下班的市集。靠近 NOOR 按 E。',
    };
  }
  if (phase === 'audit') {
    return {
      key: 'E',
      label: '到金字塔旁的值班台做跨城回归',
      hint: '六个数据系统要和第四城的可靠消息一起验证，缺一项都不算通过。',
    };
  }
  if (phase === 'rehearsal') {
    return {
      key: 'E',
      label: '在值班台做灰度故障演练',
      hint: '先让坏版本安全地失败：限制 r42 流量、观察业务不变量、自动回滚，再给 r43 切换资格。',
    };
  }
  if (phase === 'descent') {
    return {
      key: 'F',
      label: '按住 F 稳身，走下 16 米档案井',
      hint: '沿北面新展开的蓝色坡道下行。横风会把你推开；到档案之心按 E 切换 r43。',
    };
  }
  if (phase === 'complete') {
    return {
      key: 'M',
      label: '打开故障簿',
      hint: '主线已恢复。四份遗留故障可回访；沙下的证据要开 G 偏振镜才看得见。',
    };
  }
  const current: string | undefined = DUNE_CASE_FOR_PHASE[phase as keyof typeof DUNE_CASE_FOR_PHASE];
  if (current && !evidence.includes(current)) {
    return {
      key: 'Q',
      label: '扫描当前事故现场',
      hint: '先按 Q 取证，再按 E 打开值班工作台。没有证据无法编辑。',
    };
  }
  return {
    key: 'E',
    label: '打断点，改写这条承诺',
    hint: '证据已到手。按 E 打开工作台，改写当前事故的因果。',
  };
}

/* ------------------------------------------------------------------ 分派 */

/** Next action for whichever city is loaded. Null when nothing needs saying. */
export function playCoach(ctx: CoachContext): CoachStep | null {
  if (ctx.city === 'dock') return dockCoach(ctx);
  if (ctx.city === 'forge') return forgeCoach(ctx);
  if (ctx.city === 'thread') return threadCoach(ctx);
  if (ctx.city === 'snow') return snowCoach(ctx);
  return duneCoach(ctx);
}

/* ------------------------------------------------------------- 指针港工作台 */

/** Next action inside the pointer-dock causal workbench. */
export function patchCoach(patchCase: 'Q-01' | 'DS-01'): CoachStep {
  return patchCase === 'Q-01'
    ? {
      key: 'R',
      label: '把「让旅客离开」排到第一位',
      hint: '站台不能在旅客还在的时候被拆掉。拖动卡片或用 ↑↓ 调整顺序，然后按 R 重放验证。',
    }
    : {
      key: 'R',
      label: '把 A 的下一站指向 B',
      hint: 'B 已经连到 C，C 会继续去 END。拖动三维节点，或点选源点再点目标站，然后按 R 验证。',
    };
}

const ONBOARD_KEY = 'reflow-404:v6:onboarded';

/** Whether the one-time orientation has already been acknowledged. */
export function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember the orientation, so it does not interrupt a returning player. */
export function writeOnboarded(): void {
  try {
    localStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* private mode: play continues without it */
  }
}
