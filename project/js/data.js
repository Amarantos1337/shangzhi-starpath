/* 校友事实均为对应学校报道的转述，任职信息以报道日期为准。
 * 星途插画、页面设计及路线建议为本项目原创；校徽与照片来自所列官方来源。
 * 照片保留原文件，页面仅通过 CSS 调整显示范围；路线建议不代表校友本人建议。 */
(function () {
  'use strict';
  const sharedSource = { title: '云计算技术与应用产业学院举行“优秀校友进校园”讲座活动', date: '2022-10-27', url: 'https://www.sict.edu.cn/xw/xwyb/2022/1027/34069.html' };
  const historySources = {
    overview: { title: '学校官方公开资料·学校概况（PDF）', date: '2024年（资料目录年份）', url: 'https://www.sict.edu.cn/uploads/2024/0731/17224061394c37011e47e39c1f.pdf' },
    yearbook: { title: '《山东年鉴1987》·职业技术教育·山东省商业学校', date: '1987年卷', url: 'https://shandong-chorography.org/database/d00/section/1/article/126/' },
    college: { title: '教育部·关于同意建立山东商业职业技术学院的通知', date: '1999-03-12', url: 'https://www.moe.gov.cn/srcsite/A03/s7050/199903/t19990312_162105.html' },
    demonstration: { title: '教育部·第二批示范性职业技术学院建设单位通知', date: '2001-06-15', url: 'https://www.moe.gov.cn/jyb_xxgk/gk_gbgg/moe_0/moe_7/moe_16/tnull_137.html' },
    national: { title: '教育部、财政部·2007年度国家示范性高职建设单位通知', date: '2007-10-13', url: 'https://www.moe.gov.cn/srcsite/A07/moe_737/s3876_qt/200710/t20071013_109726.html' },
    acceptance: { title: '《齐鲁晚报》·山东商业职业技术学院招生访谈（PDF）', date: '2011-07-25', url: 'https://epaper.qlwb.com.cn/images/2011-07/25/T22/QT2225K.pdf' },
    doubleHigh: { title: '鲁商集团·通报表彰山东商院、青岛酒店管理职院', date: '2019-12-29', url: 'https://www.lushang.com.cn/xwzx/jtxw/2019/1229/9987.html' },
    university: { title: '教育部·关于同意设置山东商业职业技术大学的函', date: '2026-06-16（公布）', url: 'https://www.moe.gov.cn/srcsite/A03/s181/202606/t20260616_1440886.html' }
  };
  window.StarPath = window.StarPath || {};
  window.StarPath.data = {
    anniversary: {
      years: '1936 — 2026',
      title: '九秩商职，',
      subtitle: '向新而行。',
      description: '回望九秩来路，读懂一代代商职人的成长。把故事里的启发，写成今天的行动，让自己的成长成为献给母校的一份心意。',
      source: historySources.overview,
      history: [
        { year: '1936', title: '商科教育，薪火初燃', text: '学校将办学源头追溯至1936年创办的济南私立惠鲁工商职业学校。九秩商职的故事，从这段工商职业教育的早期探索讲起。', source: historySources.overview, featured: true },
        { year: '1959', title: '中专起步，积淀商业教育', text: '《山东年鉴1987》记载，前身之一山东省商业学校创建于1959年，其前身为山东财经学院中专部。1961年定名山东省济南商业学校，1966年更名为山东省商业学校，持续积累商业人才培养经验。', source: historySources.yearbook },
        { year: '1980', title: '成为全国重点中专学校', text: '山东省商业学校被确定为全国重点中专学校。年鉴记载，到20世纪80年代中期，学校已设有商业财会、商业计统、商业物价、肉食品卫生检验和制冷等专业，形成商科与应用技术并重的专业面貌。', source: historySources.yearbook },
        { year: '1999', title: '合校建院，开启高职新阶段', text: '3月12日，教育部同意在山东商业职工大学与山东商业学校的基础上建立山东商业职业技术学院，同时撤销原两校建制。学校由此进入专科层次高等职业教育的发展阶段。', source: historySources.college, featured: true },
        { year: '2001', title: '进入示范性职院建设行列', text: '教育部将山东商业职业技术学院列入第二批示范性职业技术学院建设单位名单。该批建设强调专业特色与实训基地建设，推动高等职业教育与生产实践相结合。', source: historySources.demonstration },
        { year: '2007', title: '入选国家示范性高职建设计划', text: '学校进入2007年度“国家示范性高等职业院校建设计划”立项建设院校行列。此次国家示范建设以三年为建设期，成为学校提升高职办学水平的重要节点。', source: historySources.national },
        { year: '2010', title: '以优秀成绩通过示范验收', text: '学校以优秀成绩通过国家示范院校验收。2011年《齐鲁晚报》在对学校招生就业处负责人的访谈报道中回顾了这一成果，也介绍了学校“订单式”培养与校企合作的探索。', source: historySources.acceptance },
        { year: '2019', title: '入选“双高计划”高水平学校A档', text: '学校入选中国特色高水平高职学校和专业建设计划，成为高水平学校建设单位（A档）。市场营销、云计算技术与应用两个专业群入选，连接传统商科优势与数字技术发展。', source: historySources.doubleHigh, featured: true },
        { year: '2026', title: '迈向职业本科，续写育人新篇', text: '教育部批准以山东商业职业技术学院为基础设立山东商业职业技术大学，办学层次为公办本科层次职业学校。首批设置大数据与财务管理、物流工程技术、生物制药技术、大数据工程技术、信息安全与管理5个职业本科专业。', source: historySources.university, featured: true }
      ],
      theme: { year: '2026', title: '九秩同行，续写星途', text: '以1936—2026为纪念坐标，本专题邀请你回望校史、走近校友，并用一次真实的学习实践表达心意。', note: '本站纪念主题 · 非官方活动公告' },
      tribute: {
        title: '我的九秩校庆献礼计划',
        goal: '回望校史，汲取校友故事的启发，完成一份实践作品，用自己的成长献礼母校。',
        tasks: [
          { stage: '回望校史', title: '阅读校史，整理一条自己感兴趣的历史记录', description: '从一个年份出发，留下你对母校的新认识。', href: '#/history', link: '走进九秩校史', icon: 'book' },
          { stage: '走近校友', title: '阅读一位校友的故事，写下一条成长启发', description: '读一段真实经历，找到值得带进自己生活的一步。', href: '#/alumni', link: '发现校友故事', icon: 'star' },
          { stage: '实践献礼', title: '完成现有实践库中的一个案例，并记录成果与复盘', description: '做一页校园指南，或体验数据与网络，让所学留下成果。', href: '#/paths', link: '选择一个实践案例', icon: 'compass' }
        ]
      }
    },
    alumni: [
      { id: 'wang-zongyu', name: '王宗宇', initial: '王', cohort: '2014级', field: '云计算', major: '计算机网络技术（学校2024年专访）', role: '从技能竞赛，走向算法与更远处', label: '竞赛 · 升学 · 就业', tags: ['技能竞赛', '升学深造', '技术就业'], color: 'blue', number: '01',
        photo: { src: 'assets/wang-zongyu.jpg', alt: '王宗宇在办公桌前工作的照片', style: 'work', position: '76% 45%', credit: '学校云计算技术与应用系', source: { title: '大鹏展翅，梦想起飞，职业教育点亮人生——优秀毕业生王宗宇', date: '2024-05-08', url: 'https://www.sict.edu.cn/jg_yjs/xstd/xsfc/2024/0508/43823.html' } },
        summary: '把一次次实践变成向上的阶梯，在竞赛、升学与工作之间，寻找适合自己的方向。',
        biography: '学校2022年的报道介绍，王宗宇在校期间参加云计算比赛小组并获得省赛、国赛一等奖，2017年考入滨州学院，2019年考入黑龙江大学硕士研究生。报道时，他在北京从事算法工程师工作，并返校分享学习、成长与就业经验。',
        takeaway: '在真实任务中找到兴趣，让竞赛经历、项目实践和持续学习相互连接。',
        timeline: [{ time: '2014', title: '在商职开启大学生活', text: '学校报道介绍其为2014级校友。' }, { time: '在校期间', title: '投入云计算技能竞赛', text: '加入学校云计算比赛小组，获得省赛、国赛一等奖；报道还记录了2016年省赛一等奖。' }, { time: '2017', title: '继续升学', text: '考入滨州学院。' }, { time: '2019', title: '攻读硕士研究生', text: '考入黑龙江大学硕士研究生。' }, { time: '2022', title: '回到校园，分享成长', text: '报道时从事算法工程师工作，返校交流竞赛、升学与职业发展经验。' }], routes: ['competition', 'education', 'career'], source: sharedSource },
      { id: 'shi-zhenbang', name: '石振邦', initial: '石', cohort: '2018级', field: '云计算', major: '云计算相关（报道未注明具体专业）', role: '从校园出发，在实践中找到方向', label: '学习 · 实践 · 职业', tags: ['技术就业'], color: 'sand', number: '02',
        photo: { src: 'assets/shi-zhenbang-event.jpg', alt: '石振邦参加的“优秀校友进校园”活动现场，学校官方报道配图', style: 'event', position: 'center 50%', caption: '返校活动现场', note: '活动现场配图，非本人独照；报道未标注画面中人物姓名。', credit: '学校云计算技术与应用产业学院', source: sharedSource },
        summary: '认真对待当下的学习，也提前认识未来的工作，让每一份积累有自己的落点。',
        biography: '学校2022年的报道介绍，2018级校友石振邦当时在华为济南办事处工作。他回到母校，与大一新生分享大学学习、成长和就业经验，解答学生的疑问，鼓励大家为未来做好积累。',
        takeaway: '把专业学习与真实岗位连接起来，用可以展示的作品记录自己的积累。',
        timeline: [{ time: '2018', title: '从商职启程', text: '学校报道介绍其为2018级校友。' }, { time: '截至2022年报道', title: '走入职场', text: '报道记载其工作单位为华为济南办事处，未注明具体岗位。' }, { time: '2022.10', title: '分享学习与就业经验', text: '参加“优秀校友进校园”活动，与大一新生交流成长中的选择。' }], routes: ['career'], source: sharedSource },
      { id: 'wang-gongming', name: '王功明', initial: '王', cohort: '2007级', field: '通讯技术', major: '通讯技术', role: '以持续求索，拓展人生的边界', label: '通讯 · 深造 · 科研', tags: ['升学深造', '技术就业'], color: 'slate', number: '03',
        photo: { src: 'assets/wang-gongming.jpg', alt: '王功明的官方教师肖像', style: 'headshot', position: 'center 25%', credit: '北京工业大学北京人工智能研究院', source: { title: '王功明——北京工业大学北京人工智能研究院教师主页', date: '2021-10-13（页面标注）', url: 'https://biai.bjut.edu.cn/info/1065/1140.htm' } },
        summary: '从商职到清华，再走上高校科研岗位。每一个新阶段，都从持续学习开始。',
        biography: '王功明为2007级通讯技术专业优秀毕业生。北京工业大学教师主页记载，他于2019年获得该校博士学位，2019年至2021年在清华大学自动化系从事博士后研究，随后回到北京工业大学开展教学科研。母校2025年的报道介绍其于2024年获评教授，并于2025年返校分享求学与科研经历。',
        takeaway: '把长期目标拆成可以行动的小阶段，在基础能力上持续投入。',
        timeline: [{ time: '2007', title: '学习通讯技术', text: '在山东商业职业技术学院开启大学生涯。' }, { time: '2019—2021', title: '从博士学习到博士后研究', text: '2019年获北京工业大学博士学位，随后在清华大学自动化系从事博士后研究；学位信息据本人所在单位教师主页核对。' }, { time: '2021', title: '投入科研工作', text: '进入北京工业大学，从事控制科学与工程相关研究。' }, { time: '2024', title: '获评教授', text: '学校报道记载其于2024年被评为教授。' }, { time: '2025.10', title: '回到母校分享经历', text: '参加“工匠大讲堂”，分享学生生涯与科研成长。' }], routes: ['education', 'career'], source: { title: '应用电子系组织开展“工匠大讲堂”第二十六讲', date: '2025-10-18', url: 'https://www.sict.edu.cn/xw/xwyb/2025/1018/52598.html' } },
      { id: 'chen-liang', name: '陈亮', initial: '陈', cohort: '年级未披露', field: '信创与网络安全', major: '报道未披露具体专业', role: '让人工智能，走进真实的行业', label: '人工智能 · 行业应用', tags: ['技术就业'], color: 'sage', number: '04',
        photo: { src: 'assets/chen-liang.jpg', alt: '陈亮在山东航空学院作大模型构建及行业应用报告的现场照片', style: 'event', position: '34% 64%', credit: '山东航空学院信息工程学院', source: { title: '中兴协力陈亮博士应邀请到我校做学术报告', date: '2024-09-21', url: 'https://ie.sdua.edu.cn/2024/0923/c22279a272379/page.htm' } },
        summary: '关注技术如何解决实际问题，在人工智能与传统行业的交汇处，发现新的可能。',
        biography: '学校2024年的报道将陈亮博士介绍为信创与网络安全产业学院优秀校友。报道时，他来自中兴协力（山东）数字科技集团有限公司，返校作“现代AI技术在传统行业中的应用”讲座，分享能源、通信等行业的应用案例与技术挑战。',
        takeaway: '先理解问题发生的场景，再寻找能够验证效果的技术方案。',
        timeline: [{ time: '求学阶段', title: '在商职留下足迹', text: '官方报道确认其校友身份，未披露入学年份与具体专业。' }, { time: '2024.04', title: '分享人工智能行业应用', text: '参加“信创大讲堂”，交流人工智能在能源、通信等领域的实践。' }, { time: '同场讲座', title: '讨论技术挑战与未来', text: '分享可信AI与行业融合等议题，鼓励学生持续学习新知识、新技术。' }], routes: ['career'], source: { title: '信创与网络安全产业学院举办“信创大讲堂”活动', date: '2024-04-09', url: 'https://www.sict.edu.cn/xw/xwyb/2024/0409/43218.html' } }
    ],
    routes: [
      // 完整指南在 learning.js 中补充；稳定 ID 用于兼容已有计划。
      { id: 'competition', name: '技能竞赛', subtitle: '让所学，在实践里发光', icon: 'trophy', color: 'blue' },
      { id: 'education', name: '升学深造', subtitle: '为更远的目标，走稳当下', icon: 'book', color: 'sand' },
      { id: 'career', name: '技术就业', subtitle: '把兴趣，变成看得见的能力', icon: 'briefcase', color: 'sage' }
    ]
  };
})();
