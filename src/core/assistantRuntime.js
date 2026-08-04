export const assistantRuntimeVersion = "2026.07.09";

export const assistantIntentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [
        "answer_directly",
        "ask_clarification",
        "run_agent_task",
        "switch_session",
        "switch_role",
        "switch_agent",
        "connect_session",
        "scan_workspaces",
        "open_settings",
        "play_result",
        "stop_task",
        "stop_speech",
        "show_status",
        "preview_file",
        "download_file",
        "install_agent",
        "no_action",
      ],
    },
    targetSessionIndex: { type: ["integer", "null"], minimum: 0 },
    targetSessionId: { type: ["string", "null"] },
    targetRoleId: { type: ["string", "null"] },
    targetRoleName: { type: ["string", "null"] },
    agent: { type: "string", enum: ["current", "codex", "claude"] },
    task: { type: "string" },
    reply: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    requiresConfirmation: { type: "boolean" },
    reason: { type: "string" },
  },
  required: [
    "action",
    "targetSessionIndex",
    "targetSessionId",
    "targetRoleId",
    "targetRoleName",
    "agent",
    "task",
    "reply",
    "confidence",
    "requiresConfirmation",
    "reason",
  ],
};

export const assistantRuntimeCapabilities = [
  {
    id: "session.connect",
    title: "连接工作会话",
    category: "session",
    summary: "连接已保存的服务器/工作目录/AI 类型组合，AI 任务统一通过 Agent HTTPS 执行。",
    appAction: "connect_session",
    risk: "low",
    parameters: {
      sessionId: "可选，目标会话 id；缺省为当前会话。",
      sessionIndex: "可选，从 0 开始的会话序号。",
    },
    voiceExamples: ["连接第一个", "打开第二个", "帮我连一下当前任务"],
    resultContract: "返回连接状态、通道类型、Agent 版本和远端健康摘要。",
  },
  {
    id: "session.switch",
    title: "切换项目或工作分身",
    category: "session",
    summary: "在多个项目、同一项目下的不同工作分身/任务线之间切换。切换不会中断后台任务。",
    appAction: "switch_session",
    risk: "low",
    parameters: {
      sessionIndex: "目标会话序号，从 0 开始。",
      sessionId: "目标会话 id。",
      roleId: "可选，同一工程路径下的工作分身 id。",
    },
    voiceExamples: ["第一个", "第二个", "切到官网全栈", "让上线那边接着看"],
    resultContract: "返回新的当前项目、工作分身名称、AI 类型、工作目录和任务状态。",
  },
  {
    id: "role.switch",
    title: "切换同一项目下的工作分身",
    category: "session",
    summary: "同一个工程路径可以有多个工作分身。它不是固定岗位，而是一个可端到端负责某类目标的 AI 协作者，例如全栈功能、上线、质量、数据、安全、架构、文档。",
    appAction: "switch_role",
    risk: "low",
    parameters: {
      roleId: "目标工作分身 id。",
      roleName: "目标工作分身名称，例如全栈、上线、质量、数据、安全。",
      sessionId: "可选，限定在哪个项目内切换工作分身。",
    },
    voiceExamples: ["问一下质量那边", "切到全栈", "让上线那边继续", "项目管家总结一下"],
    resultContract: "返回当前工作分身、对应会话、是否已有后台任务。",
  },
  {
    id: "session.scan_workspaces",
    title: "扫描远端 AI 会话和工作目录",
    category: "session",
    summary: "连接服务器后扫描 Codex/Claude 历史、常用工作目录和已存在 Agent 会话。",
    appAction: "scan_workspaces",
    risk: "low",
    parameters: {
      serverProfile: "服务器地址、端口、用户名、密码或密钥信息。",
      agentFilter: "codex / claude / all。",
    },
    voiceExamples: ["扫描一下这台机器", "查一下有哪些项目", "重新扫描工作目录"],
    resultContract: "返回可选择的工作目录列表、AI 类型、历史数量、最近使用时间和隐藏项。",
  },
  {
    id: "task.run",
    title: "发送任务给 Codex 或 Claude",
    category: "task",
    summary: "把用户任务交给当前或指定 AI CLI，在远端工作目录里执行。",
    appAction: "run_agent_task",
    risk: "medium",
    parameters: {
      agent: "current / codex / claude。",
      task: "清晰可执行的自然语言任务。",
      roleId: "可选，把任务派给某个工作分身/任务线。",
      attachments: "可选图片或文件引用。",
    },
    voiceExamples: ["帮我看一下这个项目有什么问题", "让全栈把这个功能做完", "让质量那边列一下回归点", "让项目管家总结一下"],
    resultContract: "返回用户可读的最终结果、任务状态、耗时、错误摘要和可复制技术详情。",
  },
  {
    id: "task.stop",
    title: "停止当前任务",
    category: "task",
    summary: "中断当前会话正在运行的 Codex/Claude 任务。",
    appAction: "stop_task",
    risk: "medium",
    parameters: {
      sessionId: "可选，目标会话 id；缺省为当前会话。",
    },
    voiceExamples: ["停止", "取消当前任务", "别跑了"],
    resultContract: "返回任务是否已取消、是否还有远端后台进程。",
  },
  {
    id: "task.status",
    title: "查看任务状态",
    category: "task",
    summary: "查看当前或所有会话的运行状态、后台任务、Agent 健康和宿主机性能。",
    appAction: "show_status",
    risk: "low",
    parameters: {
      scope: "current / all。",
    },
    voiceExamples: ["现在跑到哪了", "有哪些任务在运行", "服务器状态怎么样"],
    resultContract: "返回会话状态、通道类型、CPU/内存/磁盘、任务耗时和错误状态。",
  },
  {
    id: "result.play",
    title: "播放任务结果",
    category: "voice",
    summary: "使用 TTS 播放当前或指定会话的最新结果。播放中可以被停止语音命令打断。",
    appAction: "play_result",
    risk: "low",
    parameters: {
      sessionIndex: "可选，目标会话序号。",
      mode: "summary / full。",
    },
    voiceExamples: ["播放当前结果", "播放任务一", "重播第二个任务的回复"],
    resultContract: "返回开始播放、已停止或没有可播放结果。",
  },
  {
    id: "speech.stop",
    title: "停止播报",
    category: "voice",
    summary: "立即停止 TTS 播放，保留当前任务状态。",
    appAction: "stop_speech",
    risk: "low",
    parameters: {},
    voiceExamples: ["停一下", "别说了", "停止播放"],
    resultContract: "返回播报停止状态。",
  },
  {
    id: "agent.install",
    title: "安装或升级远端 Agent",
    category: "agent",
    summary: "通过 SSH 把 AI Workbench Agent 部署到远端，用于后台任务、状态恢复、历史同步和宿主机指标。",
    appAction: "install_agent",
    risk: "medium",
    parameters: {
      serverProfile: "目标服务器登录信息。",
    },
    voiceExamples: ["安装代理", "升级 Agent", "修复后台代理"],
    resultContract: "返回 Agent 版本、服务状态、守护进程状态和健康信息。",
  },
  {
    id: "file.preview",
    title: "预览远端文件",
    category: "file",
    summary: "通过 SSH/Agent 读取远端文件并在 App 内展示，支持代码、Markdown、CSV、PDF、Word、Excel 等类型的预览入口。",
    appAction: "preview_file",
    risk: "low",
    parameters: {
      path: "远端绝对路径或工作目录相对路径。",
    },
    voiceExamples: ["打开这个文件", "预览 README", "看一下 deploy-service.sh"],
    resultContract: "返回文件元信息、可预览内容或无法预览原因。",
  },
  {
    id: "file.download",
    title: "下载远端文件",
    category: "file",
    summary: "把远端文件拉到本地，便于分享、微信转发或离线查看。",
    appAction: "download_file",
    risk: "low",
    parameters: {
      path: "远端文件路径。",
    },
    voiceExamples: ["下载这个文件", "把日志打包给我", "保存到本地"],
    resultContract: "返回本地文件路径、大小和下载状态。",
  },
  {
    id: "settings.open",
    title: "打开设置",
    category: "settings",
    summary: "打开当前会话设置或全局设置，修改语音、播放、外观、Agent、连接信息。",
    appAction: "open_settings",
    risk: "low",
    parameters: {
      scope: "session / global。",
    },
    voiceExamples: ["打开设置", "改一下语音", "看一下当前会话配置"],
    resultContract: "返回设置页打开状态。",
  },
];

export const assistantRuntimeSystem = {
  name: "AI Workbench",
  version: assistantRuntimeVersion,
  purpose:
    "AI Workbench 是一个跨 Mac、iPhone、iPad、Android 的远程 AI 工作台。它通过 SSH 或远端 Agent 连接服务器，把用户任务发送给 Codex CLI、Claude Code 等远端 AI 工具，并把结果整理成移动端友好的聊天体验。",
  designPrinciples: [
    "用户不需要理解 SSH、tmux、shell 输出等底层细节。",
    "会话由服务器、工作目录、工作分身、AI 类型、conversationId 共同标识。",
    "同一个工作目录可以有多个工作分身；工作分身不是固定岗位，而是一个可端到端负责目标的 AI 协作者或任务线。",
    "长任务应在远端后台继续运行，App 重启或换设备后可以重新同步状态和结果。",
    "语音入口先做便捷桥梁：识别用户意图、切换任务、播放结果、发送任务；高风险操作需要确认。",
    "ASR/TTS 是输入输出通道，主 AI 只负责语义理解和动作选择，不直接执行远端命令。",
  ],
  runtimeChannels: [
    {
      id: "agent",
      label: "Agent 代理",
      description: "推荐通道。支持后台任务、状态恢复、最近历史同步、宿主机性能检测和版本升级。",
    },
    {
      id: "ssh",
      label: "直接 SSH",
      description: "兼容通道。无需安装 Agent，但 App 关闭后任务状态恢复能力较弱。",
    },
  ],
  supportedPlatforms: ["macOS", "iPhone", "iPad", "Android"],
  supportedAiWorkers: ["Codex CLI", "Claude Code"],
  roleModel: {
    metaphor: "用户像公司老板，主 AI 像助理或办公室主任，各个工作会话像项目里的协作分身或任务线。",
    project: "一个工程路径代表一个项目。",
    role: "同一个项目下可以有多个工作分身，例如全栈功能、上线、质量、数据、安全、架构、文档；也可以兼容用户习惯中的前端、后端、测试等别名。",
    delegation: "用户可以直接说“让全栈把功能做完”“问质量那边”“官网项目继续”，主 AI 负责匹配项目和工作分身。",
    reporting: "工作分身完成任务后，主 AI 用老板能理解的话汇报结果，而不是复述命令行过程。",
  },
};

export const assistantRuntimeModelInstructions = [
  "你是 AI Workbench 的主交互 AI，定位像用户的工作助理或办公室主任。",
  "用户像公司老板；每个项目会话像一个协作分身或任务线。你的职责是代用户沟通、派发、跟进和汇报。",
  "不要把 role 理解成传统固定岗位。AI 可以跨前端、后端、测试、运维端到端完成一个功能；role 更像工作模式、职责视角或任务负责人。",
  "你不能假装已经执行远端任务；需要执行时只输出结构化 action，由 App 调用对应能力。",
  "优先隐藏 SSH、tmux、命令行日志等底层细节，只向用户说明可理解的状态和下一步。",
  "同一个工程路径可能有多个工作分身会话。不要只按 workdir 判断会话，还要结合工作分身、AI 类型和 conversationId。",
  "当用户说“全栈那边”“质量那边”“上线那边”“官网项目”“支付项目”时，优先从 sessions 的项目名称、工作分身名称、别名中匹配目标。",
  "前端、后端、测试、运维这些词可以作为别名，但不要假设能力边界固定；如果用户要一个完整功能，优先派给全栈/功能型工作分身。",
  "如果项目或工作分身有歧义，action=ask_clarification，不要擅自派错对象。",
  "如果用户说“第一个/第二个/第三个”，优先理解为切换工作会话。",
  "如果用户说“播放任务一/重播第二个”，理解为播放指定会话最后一次结果。",
  "如果用户只是问 App 能力或状态，可以直接回答或请求 show_status。",
  "如果任务涉及删除、发布、安装依赖、修改生产配置、覆盖文件、重启服务，requiresConfirmation 必须为 true。",
  "输出必须严格符合 assistantIntentSchema，不输出 Markdown、解释或多余文本。",
].join("\n");

export function createAssistantRuntimeCatalog(extra = {}) {
  return {
    kind: "ai-workbench-assistant-runtime",
    version: assistantRuntimeVersion,
    generatedAt: extra.generatedAt || new Date().toISOString(),
    system: assistantRuntimeSystem,
    modelInstructions: assistantRuntimeModelInstructions,
    intentSchema: assistantIntentSchema,
    capabilities: assistantRuntimeCapabilities,
    voiceFlow: {
      defaultWakeMode: "休眠等待唤醒词；唤醒后进入 ASR；停顿约 3 秒无输入则回到唤醒模式。",
      asr: "ASR 负责把用户语音实时转文字，最终文本交给本模块做意图理解。",
      tts: "TTS 负责播报任务完成提示或完整结果；播放中支持本地打断命令。",
      localFirstIntents: ["stop_speech", "switch_session", "play_result", "stop_task"],
      modelFallback: "本地规则无法高置信识别时，把 catalog + 当前会话状态 + 用户文本交给主 AI 模型。",
    },
    stateModel: {
      session: {
        id: "App 内部会话 id。",
        conversationId: "远端 Agent 会话 id，用于跨设备映射和恢复。",
        name: "用户看到的任务/会话名称，通常是项目名 + 工作分身名。",
        projectName: "项目名称，通常来自工作目录名或用户命名。",
        roleId: "同一项目下的工作分身 id。",
        roleName: "工作分身名称，例如全栈、功能、上线、质量、数据、安全；也可兼容前端、后端等用户习惯别名。",
        roleAliases: "工作分身别名，用于自然语言匹配。",
        roleGoal: "这个工作分身负责的目标、视角或任务线，不等同于固定岗位边界。",
        agent: "codex 或 claude。",
        platform: "linux / windows / wsl。",
        workdir: "远端工作目录。",
        connectionMode: "agent 或 ssh。",
        status: "idle / connected / running / error / disconnected。",
        unreadResult: "非当前会话完成后的小绿点提示。",
      },
      task: {
        remoteTaskId: "Agent 后台任务 id。",
        status: "queued / running / done / error / cancelled。",
        result: "最终给用户看的结果。",
        liveOutput: "仅调试或等待时使用的中间输出。",
      },
    },
    examples: assistantRuntimeExamples(),
  };
}

export function assistantRuntimeExamples() {
  return [
    {
      user: "第二个",
      intent: {
        action: "switch_session",
        targetSessionIndex: 1,
        targetSessionId: null,
        targetRoleId: null,
        targetRoleName: null,
        agent: "current",
        task: "",
        reply: "已切换到第二个会话。",
        confidence: 0.98,
        requiresConfirmation: false,
        reason: "精确匹配会话序号切换。",
      },
    },
    {
      user: "播放任务一",
      intent: {
        action: "play_result",
        targetSessionIndex: 0,
        targetSessionId: null,
        targetRoleId: null,
        targetRoleName: null,
        agent: "current",
        task: "",
        reply: "正在播放第一个任务的最新结果。",
        confidence: 0.95,
        requiresConfirmation: false,
        reason: "用户要求播放指定会话结果。",
      },
    },
    {
      user: "让全栈那边把支付回调失败查清楚",
      intent: {
        action: "run_agent_task",
        targetSessionIndex: null,
        targetSessionId: null,
        targetRoleId: null,
        targetRoleName: "全栈",
        agent: "codex",
        task: "端到端检查支付回调失败的原因，覆盖接口、日志、配置、前后端调用链和最近改动，最后给出原因和修复建议。",
        reply: "",
        confidence: 0.84,
        requiresConfirmation: false,
        reason: "用户把任务派给可端到端处理功能的全栈工作分身，属于工程排查任务。",
      },
    },
    {
      user: "问一下质量那边有没有风险",
      intent: {
        action: "run_agent_task",
        targetSessionIndex: null,
        targetSessionId: null,
        targetRoleId: null,
        targetRoleName: "质量",
        agent: "claude",
        task: "从质量和上线风险视角评估当前项目，列出需要重点验证的场景、阻塞项和建议动作。",
        reply: "",
        confidence: 0.78,
        requiresConfirmation: false,
        reason: "用户在自然地询问质量工作分身的判断，适合做风险分析。",
      },
    },
    {
      user: "帮我看一下这个项目为什么部署失败",
      intent: {
        action: "run_agent_task",
        targetSessionIndex: null,
        targetSessionId: null,
        targetRoleId: null,
        targetRoleName: null,
        agent: "codex",
        task: "检查当前项目部署失败的原因，阅读相关配置、日志和脚本，最后给出问题原因和修复建议。",
        reply: "",
        confidence: 0.82,
        requiresConfirmation: false,
        reason: "这是工程排错任务，适合交给 Codex。",
      },
    },
  ];
}

export function normalizeAssistantVoiceText(value) {
  return String(value || "")
    .trim()
    .replace(/[，。,.!?！？\s]/g, "")
    .toLowerCase();
}

export function parseAssistantSmallNumber(token) {
  const text = String(token || "").trim();
  const map = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return /^\d+$/.test(text) ? Number(text) : map[text];
}

export function createAssistantIntent(partial = {}) {
  return {
    action: "no_action",
    targetSessionIndex: null,
    targetSessionId: null,
    targetRoleId: null,
    targetRoleName: null,
    agent: "current",
    task: "",
    reply: "",
    confidence: 0.5,
    requiresConfirmation: false,
    reason: "",
    ...partial,
  };
}

export function interpretLocalAssistantIntent(text) {
  const normalized = normalizeAssistantVoiceText(text);
  if (!normalized) {
    return createAssistantIntent({
      action: "no_action",
      confidence: 1,
      reason: "空输入。",
    });
  }

  if (/^(停一下|别说了|停止播放|停止播报|安静)$/.test(normalized)) {
    return createAssistantIntent({
      action: "stop_speech",
      reply: "已停止播报。",
      confidence: 0.99,
      reason: "本地 TTS 打断命令。",
    });
  }

  if (/^(停止|取消|中断|别跑了|停止任务|取消任务)$/.test(normalized)) {
    return createAssistantIntent({
      action: "stop_task",
      reply: "正在停止当前任务。",
      confidence: 0.94,
      reason: "本地任务停止命令。",
    });
  }

  const switchMatch = normalized.match(/^(?:切换到|切到|打开|进入|换到|转到)?第([一二两三四五六七八九十]|\d{1,2})个$/);
  if (switchMatch) {
    const number = parseAssistantSmallNumber(switchMatch[1]);
    if (Number.isFinite(number) && number > 0) {
      return createAssistantIntent({
        action: "switch_session",
        targetSessionIndex: number - 1,
        reply: `已切换到第 ${number} 个会话。`,
        confidence: 0.98,
        reason: "精确匹配第几个会话。",
      });
    }
  }

  const knownRoleNames = [
    "全栈",
    "功能",
    "上线",
    "质量",
    "数据",
    "安全",
    "架构",
    "增长",
    "项目管家",
    "产品",
    "前端",
    "后端",
    "测试",
    "运维",
    "审查",
    "代码审查",
    "文档",
    "设计",
  ];
  const exactRole = knownRoleNames.find((role) => normalized === role || normalized === `切到${role}` || normalized === `切换到${role}` || normalized === `问一下${role}那边`);
  if (exactRole) {
    return createAssistantIntent({
      action: "switch_role",
      targetRoleName: exactRole,
      reply: `已切换到${exactRole}工作分身。`,
      confidence: 0.88,
      reason: "匹配同一项目下的工作分身切换命令。",
    });
  }

  const delegateRole = knownRoleNames.find((role) => normalized.startsWith(`让${role}`) || normalized.startsWith(`问${role}`) || normalized.startsWith(`问一下${role}`));
  if (delegateRole) {
    const task = String(text || "")
      .trim()
      .replace(new RegExp(`^\\s*(让|问|问一下)\\s*${delegateRole}(那边)?\\s*`), "")
      .trim();
    return createAssistantIntent({
      action: task ? "run_agent_task" : "switch_role",
      targetRoleName: delegateRole,
      agent: ["产品", "质量", "数据", "架构", "项目管家", "测试", "文档", "设计"].includes(delegateRole) ? "claude" : "codex",
      task,
      reply: task ? "" : `已切换到${delegateRole}工作分身。`,
      confidence: task ? 0.74 : 0.86,
      reason: task ? "匹配把任务派给项目工作分身的表达。" : "匹配工作分身切换表达。",
    });
  }

  const playMatch = normalized.match(
    /^(?:播放|重播|再播|朗读|重复播放)(?:任务|会话)?(?:第)?([一二两三四五六七八九十]|\d{1,2})(?:个)?(?:任务|会话)?(?:结果|回复|回答)?$/,
  );
  if (playMatch) {
    const number = parseAssistantSmallNumber(playMatch[1]);
    if (Number.isFinite(number) && number > 0) {
      return createAssistantIntent({
        action: "play_result",
        targetSessionIndex: number - 1,
        reply: `正在播放第 ${number} 个会话的最新结果。`,
        confidence: 0.96,
        reason: "精确匹配播放指定会话结果。",
      });
    }
  }

  if (/^(?:播放|重播|再播|朗读|重复播放)(?:当前|这个|本)?(?:任务|会话)?(?:结果|回复|回答)?$/.test(normalized)) {
    return createAssistantIntent({
      action: "play_result",
      reply: "正在播放当前会话的最新结果。",
      confidence: 0.95,
      reason: "播放当前结果命令。",
    });
  }

  if (/^(?:连接|打开|进入|恢复)(?:当前)?(?:会话|任务|机器|服务器)?$/.test(normalized)) {
    return createAssistantIntent({
      action: "connect_session",
      reply: "正在连接当前会话。",
      confidence: 0.86,
      reason: "连接当前会话命令。",
    });
  }

  if (/^(?:扫描|重新扫描|查一下)(?:机器|服务器|项目|目录|工作目录|会话)?$/.test(normalized)) {
    return createAssistantIntent({
      action: "scan_workspaces",
      reply: "正在扫描工作目录和 AI 会话。",
      confidence: 0.86,
      reason: "扫描工作区命令。",
    });
  }

  if (/^(?:设置|打开设置|全局设置|语音设置|会话设置)$/.test(normalized)) {
    return createAssistantIntent({
      action: "open_settings",
      reply: "已打开设置。",
      confidence: 0.9,
      reason: "打开设置命令。",
    });
  }

  if (/^(?:状态|进度|现在怎么样|跑到哪了|在线吗|你在线吗)$/.test(normalized)) {
    return createAssistantIntent({
      action: "show_status",
      reply: "正在查看当前状态。",
      confidence: 0.86,
      reason: "查询状态命令。",
    });
  }

  return createAssistantIntent({
    action: "run_agent_task",
    task: String(text || "").trim(),
    confidence: 0.55,
    reason: "未命中本地命令，交给主 AI 或当前 AI worker 进一步处理。",
  });
}

export function formatAssistantRuntimeMarkdown(catalog = createAssistantRuntimeCatalog()) {
  const lines = [
    `# ${catalog.system.name} Assistant Runtime`,
    "",
    catalog.system.purpose,
    "",
    "## 主 AI 职责",
    "",
    ...catalog.system.designPrinciples.map((item) => `- ${item}`),
    "",
    "## 运行通道",
    "",
    ...catalog.system.runtimeChannels.map((item) => `- ${item.label}: ${item.description}`),
    "",
    "## 能力清单",
    "",
  ];

  catalog.capabilities.forEach((capability) => {
    lines.push(`### ${capability.id} · ${capability.title}`);
    lines.push("");
    lines.push(capability.summary);
    lines.push("");
    lines.push(`- 动作: \`${capability.appAction}\``);
    lines.push(`- 风险: \`${capability.risk}\``);
    lines.push(`- 语音示例: ${capability.voiceExamples.join(" / ")}`);
    lines.push(`- 返回: ${capability.resultContract}`);
    lines.push("");
  });

  lines.push("## 输出 JSON Schema");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(catalog.intentSchema, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## 模型指令");
  lines.push("");
  lines.push(catalog.modelInstructions);
  lines.push("");

  return lines.join("\n");
}

export function createAssistantModelContext(options = {}) {
  const catalog = createAssistantRuntimeCatalog(options);
  return {
    instructions: catalog.modelInstructions,
    inputContract: {
      userText: "ASR 或文本输入得到的用户原话。",
      activeSession: "当前会话摘要，包括名称、AI 类型、工作目录、连接状态和任务状态。",
      sessions: "最多前 N 个会话摘要，用于解析第几个、播放任务几、项目名、角色名等命令。",
      recentMessages: "当前会话最近消息摘要。",
    },
    outputSchema: catalog.intentSchema,
    capabilities: catalog.capabilities.map(({ id, title, summary, appAction, risk, parameters, voiceExamples }) => ({
      id,
      title,
      summary,
      appAction,
      risk,
      parameters,
      voiceExamples,
    })),
    examples: catalog.examples,
  };
}
