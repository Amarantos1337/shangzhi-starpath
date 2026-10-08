(function () {
  'use strict';
  const app = window.StarPath;
  const KEY = 'shangzhi-starpath:v1';
  const alumniIds = new Set(app.data.alumni.map(person => person.id));
  const routeIds = new Set(app.data.routes.map(route => route.id));
  const empty = () => ({ version: 1, favorites: [], plans: [] });
  let state = empty();
  let status = 'persistent';
  let damagedRaw = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function str(value, label, max, allowEmpty = false) {
    if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) fail(label + '格式不正确。');
    return value.trim();
  }
  function id(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('记录编号格式不正确。');
    return value;
  }
  function date(value) {
    if (value === '') return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('任务日期格式不正确。');
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > '9999-12-31') fail('任务日期无效。');
    return value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) fail('记录时间无效。');
    return value;
  }
  function generation(value) {
    if (!object(value) || value.model !== 'deepseek-flash' || !Array.isArray(value.sources) || !value.sources.length || value.sources.length > 30) fail('AI 生成信息无效。');
    const sources = value.sources.map(source => {
      if (!object(source)) fail('AI 资料来源无效。');
      const url = str(source.url, '资料链接', 2048);
      if (!/^https?:\/\/[^/\s?#@]+(?:[/?#][^\s]*)?$/.test(url)) fail('AI 资料链接仅支持 HTTP 或 HTTPS。');
      return { title: str(source.title, '资料标题', 300), url };
    });
    const metadata = { model: value.model, generatedAt: timestamp(value.generatedAt), summary: str(value.summary, '资料摘要', 3000), sources };
    if (value.constraints !== undefined) {
      const constraints = value.constraints;
      if (!object(constraints) || !object(constraints.location) || !['province', 'city', 'region'].includes(constraints.location.type) || !['', '一本', '二本'].includes(constraints.tier) || typeof constraints.needsRecommendations !== 'boolean') fail('AI 院校筛选条件无效。');
      metadata.constraints = { location: { type: constraints.location.type, name: str(constraints.location.name, '目标地区', 80) }, tier: constraints.tier, needsRecommendations: constraints.needsRecommendations };
    }
    if (value.recommendationNotice !== undefined) metadata.recommendationNotice = str(value.recommendationNotice, '院校筛选说明', 500, true);
    if (value.durationSeconds !== undefined) {
      if (!Number.isInteger(value.durationSeconds) || value.durationSeconds < 0 || value.durationSeconds > 86400) fail('AI 生成用时无效。');
      metadata.durationSeconds = value.durationSeconds;
    }
    if (value.period !== undefined) {
      if (!object(value.period)) fail('AI 计划期限无效。');
      const startDate = date(value.period.startDate);
      const endDate = date(value.period.endDate);
      const examDate = date(value.period.examDate);
      const estimated = value.period.dateStatus === 'estimated';
      const examSourceUrl = str(value.period.examSourceUrl, '考试日期出处', 2048, estimated);
      if (!startDate || !endDate || startDate > endDate) fail('AI 计划期限无效。');
      if (estimated) {
        if (examDate || examSourceUrl) fail('暂定计划不能包含正式考试日期。');
      } else {
        const previous = new Date(examDate + 'T00:00:00Z');
        previous.setUTCDate(previous.getUTCDate() - 1);
        if (!examDate || !Number.isFinite(previous.getTime()) || endDate !== previous.toISOString().slice(0, 10) || !sources.some(source => source.url === examSourceUrl)) fail('AI 计划期限或考试日期出处无效。');
      }
      metadata.period = { startDate, endDate, examDate, examSourceUrl };
      if (value.period.dateStatus !== undefined) {
        const year = value.period.targetExamYear;
        if (!['official', 'estimated'].includes(value.period.dateStatus) || !Number.isInteger(year) || year < 1900 || year > 9998 || Number((examDate || endDate).slice(0, 4)) !== year) fail('AI 目标考试年度无效。');
        Object.assign(metadata.period, { dateStatus: value.period.dateStatus, targetExamYear: year, planningBasis: str(value.period.planningBasis, '学年推算依据', 300) });
      }
    }
    if (value.recommendations !== undefined) {
      if (!Array.isArray(value.recommendations) || value.recommendations.length > 5) fail('AI 推荐院校无效。');
      metadata.recommendations = value.recommendations.map(school => {
        if (!object(school)) fail('AI 推荐院校无效。');
        const sourceUrl = str(school.sourceUrl, '院校资料出处', 2048);
        if (!sources.some(source => source.url === sourceUrl) || !/^https?:\/\/(?:[^./\s@]+\.)*(?:edu\.cn|chsi\.com\.cn)(?:[/?#]|$)/.test(sourceUrl)) fail('AI 推荐院校出处无效。');
        const entry = { name: str(school.name, '院校名称', 120), reason: str(school.reason, '推荐理由', 500), sourceUrl };
        if (school.location !== undefined) {
          if (!object(school.location) || !sources.some(source => source.url === school.location.sourceUrl)) fail('AI 院校所在地出处无效。');
          entry.location = { province: str(school.location.province, '院校所在省份', 40), city: str(school.location.city, '培养校区所在城市', 40), campus: str(school.location.campus, '专业培养校区', 120), sourceUrl: school.location.sourceUrl };
        }
        if (school.criteriaEvidence !== undefined) {
          if (!Array.isArray(school.criteriaEvidence) || school.criteriaEvidence.length > 5) fail('AI 院校条件匹配依据无效。');
          entry.criteriaEvidence = school.criteriaEvidence.map(item => {
            if (!object(item) || !sources.some(source => source.url === item.sourceUrl)) fail('AI 院校条件匹配出处无效。');
            return { criterion: str(item.criterion, '院校筛选条件', 80), explanation: str(item.explanation, '院校匹配依据', 500), sourceUrl: item.sourceUrl };
          });
        }
        if (metadata.constraints) {
          const required = metadata.constraints.location;
          const normalize = place => place.replace(/(?:壮族|回族|维吾尔)?自治区$|[省市]$/g, '');
          if (!entry.location || (required.type !== 'region' && normalize(required.type === 'province' ? entry.location.province : entry.location.city) !== required.name)) fail('AI 推荐院校不符合保存的地域要求。');
          const tier = metadata.constraints.tier;
          const batch = tier === '一本' ? /本科(?:第?一批|第一批)|历史.{0,24}一本/ : /本科(?:第?二批|第二批)|历史.{0,24}二本/;
          if (tier && !(entry.criteriaEvidence || []).some(item => (item.criterion.includes(tier) || batch.test(item.criterion)) && !/^(?:历史)?(?:非|不符合|不满足|不属于)/.test(item.criterion) && batch.test(item.explanation) && !/(?:一本|二本|历史批次|历史招生口径).{0,12}(?:无法核实|未核实|待核实|不满足|不符合|未找到|不能确认)/.test(item.explanation))) fail('AI 推荐院校缺少层次匹配依据。');
        }
        return entry;
      });
    }
    if (metadata.constraints && metadata.constraints.needsRecommendations && (metadata.recommendations || []).length < 2 && !metadata.recommendationNotice) fail('AI 推荐院校不足时必须保留筛选说明。');
    return metadata;
  }
  function validate(value) {
    if (!object(value) || value.version !== 1) fail('不支持此数据格式或版本，请选择商职星途导出的备份。');
    if (!Array.isArray(value.favorites) || value.favorites.length > alumniIds.size || value.favorites.some(item => !alumniIds.has(item))) fail('收藏数据无效。');
    if (!Array.isArray(value.plans) || value.plans.length > 20) fail('计划数据无效，最多支持20份计划。');
    const seenPlans = new Set();
    const plans = value.plans.map(plan => {
      if (!object(plan)) fail('计划格式无效。');
      const planId = id(plan.id);
      if (seenPlans.has(planId)) fail('计划编号重复。');
      seenPlans.add(planId);
      if (plan.templateId !== null && !routeIds.has(plan.templateId)) fail('计划模板无效。');
      if (!Array.isArray(plan.tasks) || plan.tasks.length > 100) fail('每份计划最多支持100项任务。');
      const seenTasks = new Set();
      const tasks = plan.tasks.map(task => {
        if (!object(task)) fail('任务格式无效。');
        const taskId = id(task.id);
        if (seenTasks.has(taskId)) fail('任务编号重复。');
        seenTasks.add(taskId);
        if (typeof task.completed !== 'boolean') fail('任务状态无效。');
        return { id: taskId, title: str(task.title, '任务名称', 180), stage: str(task.stage, '阶段名称', 80), dueDate: date(task.dueDate), completed: task.completed };
      });
      const entry = { id: planId, templateId: plan.templateId, title: str(plan.title, '计划名称', 120), goal: str(plan.goal, '成长目标', 1000, true), createdAt: timestamp(plan.createdAt), updatedAt: timestamp(plan.updatedAt), tasks };
      if (plan.generation !== undefined) entry.generation = generation(plan.generation);
      return entry;
    });
    return { version: 1, favorites: [...new Set(value.favorites)], plans };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      try { state = validate(JSON.parse(raw)); }
      catch (_) { status = 'damaged'; damagedRaw = raw; }
    }
    if (status !== 'damaged') {
      const probe = KEY + ':availability';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    }
  } catch (_) { status = 'session'; }

  function save() {
    if (status === 'damaged') return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      status = 'persistent';
      return true;
    } catch (_) { status = 'session'; return false; }
  }
  function update(change) {
    const draft = copy(state);
    change(draft);
    state = validate(draft);
    const persisted = save();
    window.dispatchEvent(new CustomEvent('starpath:change', { detail: { persisted } }));
    return persisted;
  }
  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }
  function progress(plan) {
    const total = plan.tasks.length;
    const complete = plan.tasks.filter(task => task.completed).length;
    return { total, complete, percent: total ? Math.round(complete / total * 100) : 0 };
  }
  app.store = {
    key: KEY,
    get: () => copy(state),
    status: () => status,
    damagedRaw: () => damagedRaw,
    uid, progress, update,
    validate,
    parseBackup(text) {
      if (typeof text !== 'string' || text.length > 1024 * 1024) fail('请选择不超过1 MB的备份文件。');
      let value;
      try { value = JSON.parse(text); } catch (_) { fail('文件不是有效的 JSON，现有记录未作更改。'); }
      if (!object(value) || value.app !== 'shangzhi-starpath') fail('这不是商职星途导出的备份文件。');
      return validate(value);
    },
    exportBackup: () => JSON.stringify({ app: 'shangzhi-starpath', exportedAt: new Date().toISOString(), ...state }, null, 2),
    replace(value) {
      state = validate(value);
      damagedRaw = null;
      status = 'session';
      const persisted = save();
      window.dispatchEvent(new CustomEvent('starpath:change', { detail: { persisted } }));
      return persisted;
    },
    toggleFavorite(personId) {
      if (!alumniIds.has(personId)) fail('未找到这位校友。');
      return update(draft => { draft.favorites = draft.favorites.includes(personId) ? draft.favorites.filter(value => value !== personId) : [...draft.favorites, personId]; });
    },
    createPlan(templateId, details = {}) {
      if (state.plans.length >= 20) fail('最多可保存20份计划，请先整理已有计划。');
      const template = app.data.routes.find(route => route.id === templateId);
      if (templateId !== null && !template) fail('未找到这条路线。');
      let initialTasks = [];
      if (details.initialTasks !== undefined) {
        if (templateId !== null) fail('预置任务仅适用于自定义计划。');
        if (!Array.isArray(details.initialTasks) || details.initialTasks.length > 100) fail('预置任务无效，最多支持100项任务。');
        initialTasks = Array.from(details.initialTasks, task => {
          if (!object(task)) fail('预置任务格式无效。');
          return { id: uid(), title: str(task.title, '任务名称', 180), stage: str(task.stage, '阶段名称', 80), dueDate: '', completed: false };
        });
      }
      const now = new Date().toISOString();
      const plan = { id: uid(), templateId, title: details.title ?? (template ? '我的' + template.name + '计划' : '我的成长计划'), goal: details.goal ?? '', createdAt: now, updatedAt: now,
        tasks: template ? template.stages.flatMap(stage => stage.tasks.map(title => ({ id: uid(), title, stage: stage.title, dueDate: '', completed: false }))) : initialTasks };
      const persisted = update(draft => { draft.plans.unshift(plan); });
      return { id: plan.id, persisted };
    },
    createAiPlan(details) {
      if (state.plans.length >= 20) fail('最多可保存20份计划，请先整理已有计划。');
      if (!object(details) || !Array.isArray(details.tasks) || details.tasks.length < 12 || details.tasks.length > 24) fail('AI 计划需要12–24项任务。');
      const tasks = details.tasks.map(task => {
        if (!object(task)) fail('AI 任务格式无效。');
        const dueDate = date(task.dueDate);
        if (!dueDate) fail('AI 任务需要建议日期。');
        return { id: uid(), title: str(task.title, '任务名称', 180), stage: str(task.stage, '阶段名称', 80), dueDate, completed: false };
      });
      if (new Set(tasks.map(task => task.stage)).size !== 4) fail('AI 计划需要4个阶段。');
      const now = new Date().toISOString();
      const plan = { id: uid(), templateId: 'education', title: str(details.title, '计划名称', 120), goal: str(details.goal, '成长目标', 1000), createdAt: now, updatedAt: now, tasks, generation: generation(details.generation) };
      const persisted = update(draft => { draft.plans.unshift(plan); });
      return { id: plan.id, persisted };
    },
    editPlan(planId, change) {
      return update(draft => {
        const plan = draft.plans.find(item => item.id === planId);
        if (!plan) fail('这份计划已不存在。');
        change(plan);
        plan.updatedAt = new Date().toISOString();
      });
    },
    deletePlan(planId) { return update(draft => { draft.plans = draft.plans.filter(plan => plan.id !== planId); }); }
  };
})();
