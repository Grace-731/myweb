const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('.character-stage');
const dialog = $('#detail');
const intro = $('#intro');
const video = $('#intro-video');
let config, opener, poseId = 'default', introTimer, leaveTimer, toastTimer;
let closing = false;

// 配置属于可编辑内容：统一转义文本，避免简历中的特殊字符被当作 HTML 执行。
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

// 仅接受 HTTP(S) 仓库地址；没有提供地址时，不渲染空按钮或虚构链接。
function repositoryLink(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

// 人物图片提前加载到同一尺寸的绝对定位容器，通过 opacity 交叉淡入。
// 等新图片解码完成再切换，防止首次悬停时出现空白；加载失败则保留默认人物。
async function setPose(id = 'default') {
  poseId = id;
  const target = stage.querySelector(`[data-pose="${id}"]`);
  if (!target) return;
  try { await target.decode(); } catch { return; }
  if (poseId !== id) return;
  stage.querySelectorAll('img').forEach(image => image.classList.toggle('visible', image === target));
}

// 来自用户参考 HTML 的详情内容保存为 JSON 节点树，只渲染白名单标签与转义文本。
// 不引入参考文件的脚本、媒体、首页样式，因此原网站首页与交互保持原样。
function renderDetailNode(node) {
  if (typeof node === 'string') return escapeHTML(node);
  const allowed = new Set(['article', 'div', 'section', 'h3', 'h4', 'p', 'span', 'strong', 'time', 'br']);
  if (!allowed.has(node.tag)) return '';
  if (node.tag === 'br') return '<br>';
  const classes = node.class ? ` class="${escapeHTML(node.class)}"` : '';
  return `<${node.tag}${classes}>${(node.children || []).map(renderDetailNode).join('')}</${node.tag}>`;
}

function renderArticle(item) {
  if (item.nodes) {
    let html = item.nodes.map(renderDetailNode).join('');
    // 只为配置了入口的这两个条目附加控件，不改变其余条目的渲染。
    const controls = (item.actions || []).map(action => {
      const url = repositoryLink(action.url);
      return url ? `<a class="ar-action" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(action.label)}</a>` : '';
    }).join('') + (item.certificate ? `<button class="ar-action" type="button" data-ar-certificate="${escapeHTML(item.certificate.id)}">${escapeHTML(item.certificate.label)}</button>` : '');
    if (controls) html = html.replace(/<\/article>$/, `<div class="ar-actions">${controls}</div></article>`);
    return html;
  }
  const url = repositoryLink(item.github);
  return `<article>
    ${item.tag ? `<span class="tag">${escapeHTML(item.tag)}</span>` : ''}
    <h3>${escapeHTML(item.title)}</h3>
    ${item.meta ? `<div class="meta">${escapeHTML(item.meta)}</div>` : ''}
    ${item.intro ? `<p class="intro-text">${escapeHTML(item.intro)}</p>` : ''}
    ${item.text ? `<p>${escapeHTML(item.text)}</p>` : ''}
    ${(item.items || []).map(([label, text]) => `<div class="detail-row"><h4>${escapeHTML(label)}</h4><p>${escapeHTML(text)}</p></div>`).join('')}
    ${item.stats ? `<div class="stats">${item.stats.map(([value, label]) => `<div class="stat"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join('')}</div>` : ''}
    ${item.tags ? `<div class="chips">${item.tags.map(tag => `<span>${escapeHTML(tag)}</span>`).join('')}</div>` : ''}
    ${url ? `<a class="repository-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>` : ''}
  </article>`;
}

function openDetail(section, button) {
  if (dialog.open || closing) return;
  opener = button;
  setPose(section.id);
  button.classList.add('active');
  $('#detail-code').textContent = `ARCHIVE ${section.num} / ${section.en}`;
  // 经历按 JSON 数组原顺序呈现，绝不在 UI 层按项目类型重排。
  $('#detail-content').innerHTML = `<div class="detail-heading">
    <span class="big-num">${escapeHTML(section.num)}</span><div>
    <h2 id="detail-title">${escapeHTML(section.zh)}</h2><span class="detail-en">${escapeHTML(section.en)}</span>
    </div></div>${config[section.id].map(renderArticle).join('')}`;
  // 原生 dialog 提供焦点约束和背景 inert，避免键盘落到弹窗后面的卡片。
  dialog.showModal();
  dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('#close-detail').focus({ preventScroll: true });
}

function closeDetail() {
  if (!dialog.open || closing) return;
  closing = true;
  dialog.classList.add('closing');
  setTimeout(() => {
    dialog.close();
    dialog.classList.remove('closing');
    closing = false;
  }, reducedMotion.matches ? 0 : 180);
}

function setupTickets() {
  config.sections.forEach(section => {
    const button = document.createElement('button');
    button.className = 'ticket';
    button.dataset.id = section.id;
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `${section.num} ${section.zh}，查看详情`);
    button.innerHTML = `<span class="ticket-num">${escapeHTML(section.num)}</span>
      <h2>${escapeHTML(section.zh)}</h2><span class="ticket-en">${escapeHTML(section.en)}</span>
      <span class="ticket-keywords">${escapeHTML(section.keywords)}</span>
      <span class="stub" aria-hidden="true">ARCHIVE / ${escapeHTML(section.num)}</span><span class="barcode" aria-hidden="true"></span>
      <span class="ticket-cta" aria-hidden="true">查看详情 ↗</span>`;
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') setPose(section.id);
    });
    button.addEventListener('pointerleave', () => { if (!dialog.open) setPose(); });
    button.addEventListener('focus', () => setPose(section.id));
    button.addEventListener('blur', () => { if (!dialog.open) setPose(); });

    // 手机短按：切换人物并打开详情。长按 420ms：仅预览该姿势，松开恢复。
    // 一旦手指移动超过 10px 就取消长按，让页面正常滚动；不阻止默认 touch 行为。
    let pressTimer, longPressed = false, startPoint;
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return;
      longPressed = false;
      startPoint = { x: event.clientX, y: event.clientY };
      setPose(section.id);
      pressTimer = setTimeout(() => {
        longPressed = true;
        button.classList.add('active');
        setPose(section.id);
      }, 420);
    });
    button.addEventListener('pointermove', event => {
      if (startPoint && Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y) > 10) {
        clearTimeout(pressTimer);
        startPoint = null;
      }
    });
    const release = () => {
      clearTimeout(pressTimer);
      startPoint = null;
      if (longPressed) { button.classList.remove('active'); setPose(); }
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', () => { release(); setPose(); });
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('click', event => {
      if (longPressed && event.detail !== 0) { longPressed = false; return; }
      openDetail(section, button);
    });
    $('.tickets').append(button);
  });
}

function setupDialog() {
  $('#close-detail').onclick = closeDetail;
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  // 只有按下和抬起都发生在面板外，才算点击遮罩；拖拽选择正文不会误关窗。
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  let backdropDown = false;
  dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog && outside(event)) closeDetail(); });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    opener?.classList.remove('active');
    opener?.focus({ preventScroll: true });
    setPose();
  });
}

function hasSeenIntro() {
  try { return sessionStorage.getItem('archive-intro-seen') === '1'; } catch { return false; }
}
let introRun = 0;
let introHomeReady = Promise.resolve();

// 末帧锚点来自原片的 1280 × 720 画面。只在横向视口交接时对齐真实首页。
const introTicketAnchors = [
  { x: 189, y: 232, width: 265, height: 187, angle: -23 },
  { x: 485, y: 129, width: 273, height: 180, angle: -9 },
  { x: 803, y: 136, width: 269, height: 180, angle: 10 },
  { x: 1092, y: 250, width: 273, height: 196, angle: 21 }
];
let introAlignment = [];

function alignIntroHome() {
  if (innerWidth <= 760 || innerWidth / innerHeight < 1.35) return;
  // 重播按钮靠近底部，浏览器可能为点击它滚动页面。配准以首页顶端为基准。
  window.scrollTo({ top: 0, behavior: 'instant' });
  const videoBox = video.getBoundingClientRect();
  const fit = Math.min(videoBox.width / 1280, videoBox.height / 720);
  const frameX = videoBox.left + (videoBox.width - 1280 * fit) / 2;
  const frameY = videoBox.top + (videoBox.height - 720 * fit) / 2;
  const framePoint = (x, y) => [frameX + x * fit, frameY + y * fit];
  const options = { delay: 120, duration: 220, easing: 'ease-out', fill: 'backwards' };
  const home = $('#home');

  function settle(element, from, to, origin = '50% 50%') {
    introAlignment.push(element.animate([
      { transform: from, transformOrigin: origin },
      { transform: to, transformOrigin: origin }
    ], options));
  }

  home.querySelectorAll('.ticket').forEach((ticket, index) => {
    const anchor = introTicketAnchors[index];
    const box = ticket.getBoundingClientRect();
    const [x, y] = framePoint(anchor.x, anchor.y);
    const dx = x - box.left - box.width / 2;
    const dy = y - box.top - box.height / 2;
    const sx = anchor.width * fit / ticket.offsetWidth;
    const sy = anchor.height * fit / ticket.offsetHeight;
    settle(ticket, `translate(${dx}px, ${dy}px) rotate(${anchor.angle}deg) scale(${sx}, ${sy})`,
      getComputedStyle(ticket).transform);
  });

  // 用双眼中心和眼距配准透明人物图，保持人物等比缩放。
  const portrait = stage.querySelector('[data-pose="default"]');
  if (portrait?.naturalWidth) {
    const box = portrait.getBoundingClientRect();
    const imageFit = Math.min(box.width / portrait.naturalWidth, box.height / portrait.naturalHeight);
    const eyeX = (box.width - portrait.naturalWidth * imageFit) / 2 + 433 * imageFit;
    const eyeY = box.height - portrait.naturalHeight * imageFit + 212 * imageFit;
    const [x, y] = framePoint(639, 357);
    settle(portrait, `translate(${x - box.left - eyeX}px, ${y - box.top - eyeY}px) scale(${86 * fit / (115 * imageFit)})`,
      'none', `${eyeX}px ${eyeY}px`);
  }

  const title = home.querySelector('.title-layer');
  const heading = title.querySelector('h1');
  const box = heading.getBoundingClientRect();
  // 标题行盒包含留白，以当前字体中大写字形的实际顶边作对照。
  const glyphTop = box.top + 0.2 * parseFloat(getComputedStyle(heading).fontSize);
  const [x, y] = framePoint(50, 427);
  settle(title, `translate(${x - box.left}px, ${y - glyphTop}px)`, 'none');
}

function finishIntro(event) {
  if (intro.hidden || intro.classList.contains('leaving')) return;
  clearTimeout(introTimer);
  clearTimeout(leaveTimer);
  video.pause();
  try { sessionStorage.setItem('archive-intro-seen', '1'); } catch { /* 存储不可用时仍可进入首页 */ }

  const run = ++introRun;
  const shouldRestoreFocus = intro.contains(document.activeElement);
  const close = () => {
    if (run !== introRun || intro.hidden) return;
    intro.hidden = true;
    intro.classList.remove('leaving');
    $('#home').inert = false;
    if (shouldRestoreFocus) $('#replay').focus({ preventScroll: true });
  };

  // 跳过、播放失败和减少动态效果时直接交接。
  if (event?.type !== 'ended' || reducedMotion.matches) {
    close();
    return;
  }

  // 等待人物和字体准备好。短超时确保单个资源不会卡住首页。
  leaveTimer = setTimeout(reveal, 160);
  introHomeReady.then(reveal);
  function reveal() {
    if (run !== introRun || intro.hidden || intro.classList.contains('leaving')) return;
    clearTimeout(leaveTimer);
    if (reducedMotion.matches) {
      close();
      return;
    }
    alignIntroHome();
    intro.classList.add('leaving');
    $('#home').inert = false;
    // CSS 交接结束后收起叠层，即使浏览器未派发 transitionend 也能退出。
    leaveTimer = setTimeout(close, 150);
  }
}
async function startIntro() {
  const run = ++introRun;
  introAlignment.forEach(animation => animation.cancel());
  introAlignment = [];
  clearTimeout(leaveTimer);
  clearTimeout(introTimer);
  intro.classList.remove('leaving');
  intro.hidden = false;
  $('#home').inert = true;
  video.currentTime = 0;
  video.muted = true;
  $('#play-intro').hidden = true;
  $('#skip-intro').focus({ preventScroll: true });
  // 首屏加载超时也能进入主页；不会被损坏或不可用的视频一直挡住。
  introTimer = setTimeout(() => { if (video.readyState < 2) finishIntro(); }, 10000);
  try {
    await video.play();
  } catch {
    if (run === introRun && !intro.hidden) $('#play-intro').hidden = false;
  }
}
function setupIntro() {
  const portrait = stage.querySelector('[data-pose="default"]');
  introHomeReady = Promise.allSettled([portrait?.decode(), document.fonts?.ready]);
  video.poster = config.media.introPoster;
  video.src = config.media.introVideo;
  video.addEventListener('ended', finishIntro);
  video.addEventListener('error', () => { finishIntro(); toast('视频暂时无法加载，已显示静态封面'); });
  video.addEventListener('waiting', () => { clearTimeout(introTimer); introTimer = setTimeout(finishIntro, 12000); });
  video.addEventListener('playing', () => clearTimeout(introTimer));
  $('#skip-intro').onclick = finishIntro;
  $('#replay').onclick = startIntro;
  $('#play-intro').onclick = async () => {
    try { await video.play(); $('#play-intro').hidden = true; } catch { finishIntro(); }
  };
  // 点击视频本身也可以跳过开场，按钮区域独立处理，不会触发两次。
  video.addEventListener('click', finishIntro);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !intro.hidden) finishIntro(); });
  reducedMotion.addEventListener('change', event => { if (event.matches) finishIntro(); });
  if (!hasSeenIntro() && !reducedMotion.matches && !['#projects', '#case/private-fund-agent', '#case/accessroute-hk', '#case/365-customer-service'].includes(location.hash)) startIntro();
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('链接已复制');
  } catch {
    // 兼容不提供 Clipboard API 的浏览器；复制失败时提供可选中的实际链接。
    const input = document.createElement('textarea');
    input.value = url;
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    toast(copied ? '链接已复制' : `请复制地址栏中的网站链接：${url}`);
  }
}
function setupSharing() {
  $('#share').onclick = async () => {
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: config.ui.shareTitle, text: config.ui.discipline, url }); return; }
      catch (error) { if (error.name === 'AbortError') return; }
    }
    await copyLink(url);
  };
}

async function initialize() {
  // 所有简历内容及图片、视频路径仅从一个 JSON 读取，无需修改组件即可替换资料。
  const response = await fetch('./data/config.json');
  if (!response.ok) throw new Error(`配置读取失败 (${response.status})`);
  config = await response.json();
  const { ui, profile, media } = config;
  document.title = ui.pageTitle;
  $('meta[name="description"]').content = ui.description;
  $('.brand').textContent = `${profile.name} ${ui.brandSuffix}`;
  $('.discipline').replaceChildren(document.createTextNode(`${ui.discipline} `), document.createElement('i'));
  $('h1').textContent = ui.mainTitle;
  $('.subtitles').innerHTML = `<span>${escapeHTML(ui.archiveLabel)}</span><span class="rule"></span><span>${escapeHTML(profile.name)} <b>✦</b></span>`;
  $('.handwriting').textContent = ui.handwriting;
  $('.bottom-note').textContent = ui.bottomNote;
  $('footer').innerHTML = ui.footer.map(value => `<span>${escapeHTML(value)}</span>`).join('<i></i>');
  $('.intro-caption').textContent = ui.introCaption;
  $('.modal-foot').innerHTML = `${escapeHTML(profile.name)} / ${escapeHTML(ui.mainTitle)}<span>${escapeHTML(ui.handwriting.replace(/\n/g, ''))}</span>`;
  Object.entries(media.characters).forEach(([id, src]) => {
    const image = new Image();
    image.src = src;
    image.alt = '';
    image.dataset.pose = id;
    if (id === 'default') image.className = 'visible';
    image.addEventListener('error', () => { if (id !== 'default') image.remove(); });
    stage.append(image);
  });
  setupTickets(); setupDialog(); setupSharing(); setupIntro(); setupCaseStudy(); setupAwardCertificate(); setupAccessRouteCase(); setupCustomerCase(); setupPersonalPortrait();
}
initialize().catch(error => { console.error(error); toast('配置加载失败，请检查 data/config.json 后刷新页面'); });

// Case Study 独立命名空间；不改写首页组件和样式。路由与静态导出共用此实现。
function setupCaseStudy() {
 const data=config.caseStudy;if(!data)return;
 const root=document.createElement('section');root.id='cs';root.className='cs';root.hidden=true;
 const esc=escapeHTML;
 const names=['PROJECT OVERVIEW','PROBLEM & PRODUCT THINKING','PRODUCT ARCHITECTURE','AGENT WORKFLOW','KNOWLEDGE & RISK','EVALUATION & OPTIMIZATION','BAD CASE ANALYSIS','DEMO & REFLECTION'];
 const heading=(i,title,subtitle)=>`<div class="cs-section-head"><span class="cs-index">${String(i).padStart(2,'0')}</span><div><div class="cs-kicker">${names[i-1]}</div><h2>${title}</h2><p>${subtitle}</p></div></div>`;
 const picture=(src,label)=>`<button class="cs-picture" data-cs-image="${esc(src)}" aria-label="放大查看${label}"><span class="cs-image-label">V1.2 / MOCK_MODE <b>查看原图 ↗</b></span><img src="${esc(src)}" alt="${label}" loading="lazy"></button>`;
 const tabs=(type,labels)=>`<div class="cs-tabs" role="group" aria-label="${type}">${labels.map((x,i)=>`<button data-cs-tab="${type}" data-i="${i}" aria-pressed="${i===0}">${esc(x)}</button>`).join('')}</div>`;
 root.innerHTML=`<div class="cs-top"><span>张嘉铭 / CASE FILE 02</span><div><button data-cs-route="projects">← 返回项目经历</button><button data-cs-route="home">个人主页 ↗</button></div></div>
 <nav class="cs-nav" aria-label="Case Study 章节">${names.map((n,i)=>`<button data-cs-anchor="${i+1}" aria-current="${i===0?'location':'false'}">${String(i+1).padStart(2,'0')} <span>${n.split(' & ')[0]}</span></button>`).join('')}</nav>
 <div class="cs-body">
 <section class="cs-section cs-hero" id="cs-1"><div class="cs-kicker">PERSONAL PRODUCT PRACTICE / V1.2 / LOCAL DEMO</div><h1 tabindex="-1">PRIVATE FUND<br><em>AI AGENT</em></h1><div class="cs-hero-grid"><div><h2>私募基金运营 AI Agent</h2><p class="cs-lead">从找到条款，到知道<br>什么时候不该回答。</p><p>面向私募证券基金运营、合规支持与新员工的个人 AI 产品实践：可追溯法规查询、证据检查及风险边界。</p><dl><dt>产品实践范围</dt><dd>需求与 MVP、知识治理、工作流、评测与迭代</dd><dt>核心技术</dt><dd>Python Web / BM25 / RAG 工作流 / 规则风控 / 证据与引用校验</dd><dt>版本范围</dt><dd>V1.2 · MOCK_MODE<br>知识快照 2026-10-29 · 中国内地私募证券基金</dd></dl><button class="cs-solid" data-cs-anchor="6">查看评测证据 ↓</button></div><div>${picture(data.demo,'真实 V1.2 双周期回答工作台')}<p class="cs-source">来源：09_项目交付 / logs / 最终截图 / 双周期回答.png</p></div></div><div class="cs-strip"><span><b>58</b>启用法规切片</span><span><b>60</b>合成测试场景</span><span><b>59/60</b>Mock 回归完全通过</span><span><b>0</b>真实客户验证</span></div></section>
 <section class="cs-section" id="cs-2">${heading(2,'先缩小承诺，再建立信任。','从宽泛运营助手，收敛到可追溯法规查询、证据检查与风险控制 Demo。')}<div class="cs-two"><div class="cs-column"><h3>公开资料支持的业务约束</h3><p>募集限制与信息披露义务客观存在；基金类型、条款版本与适用日期需要区分。</p><small>公开资料桌面研究：6 个具体产品、15 项业务或法规资料、12 个场景。没有真实用户访谈。</small></div><div class="cs-column"><h3>待用户验证的痛点假设</h3><p>法规查询定位复杂、流程知识分散、适用性判断成本高。尚不能声称用户已确认、节省工时或有付费意愿。</p></div></div><div class="cs-decisions">${[['法规查找复杂','找到可核对的依据','法规查询 + 原文引用'],['知识与流程分散','先治理知识来源','结构化文件 + 版本白名单'],['AI 回答适用性风险','不越过证据与授权边界','无答案、拒答、澄清与人工核验']].map(([a,b,c])=>`<div><span>问题假设</span><h3>${a}</h3><span>产品目标 → MVP 决策</span><p>${b}<br><b>${c}</b></p></div>`).join('')}</div><p class="cs-note">P0：法规查询、引用与无答案、风险识别、结构化知识管理。真实机构 SOP、模板逐字段填报、自动报送与企业审批不在已交付范围。</p></section>
 <section class="cs-section" id="cs-3">${heading(3,'一条能追溯的实现链。','点击真实架构节点，检查作用、输入、输出及实现依据。')}<div class="cs-graph-tools"><span>据最终 Mermaid 整体架构图重绘</span><button data-cs-zoom="-">缩小 −</button><button data-cs-zoom="+">放大 +</button><button data-cs-zoom="0">适应宽度</button></div><div class="cs-graph" id="cs-graph"></div><div class="cs-inspector" id="cs-arch-detail" aria-live="polite"></div><details class="cs-details"><summary>查看五张原始 Mermaid 图与来源</summary><div id="cs-mermaid-docs"></div></details></section>
 <section class="cs-section" id="cs-4">${heading(4,'Agent 的价值，也在于停止。','这是交互式流程说明，不是真实实时 Agent 执行轨迹。')}<div class="cs-workflow-layout"><div class="cs-steps">${data.workflow.map((n,i)=>`<button data-cs-flow="${i}" aria-pressed="${i===0}"><span>${String(i+1).padStart(2,'0')}</span>${esc(n.label)} <b>↓</b></button>`).join('')}</div><div class="cs-workflow-detail"><div class="cs-inspector" id="cs-flow-detail" aria-live="polite"></div><div class="cs-branches"><h3>真实分支 / 非所有输入都生成答案</h3><p><b>REFUSE</b> → 限制输出并记录</p><p><b>CLARIFY / VERIFY_REQUIRED</b> → 补充条件或核验来源</p><p><b>REVIEW</b> → 证据阶段创建 PENDING，不发布答案</p><p>证据不足或检查异常 → 停止发布；充分证据才进入上下文构建。</p></div><small>依据：02_Agent工作流图.md；04 核心 workflow.py。分类内含 query_plan，未虚构额外模型节点。</small></div></div></section>
 <section class="cs-section" id="cs-5">${heading(5,'知识有层级，依据有门槛。','16 个来源记录 → 62 条结构化条目 → 58 条启用现行法规切片。')}<div class="cs-big-number">62<span>条结构化条目</span><b>58 启用 / 1 待核 / 3 模拟</b></div>${tabs('knowledge',data.knowledge.map(k=>k.name))}<div id="cs-knowledge" class="cs-inspector" aria-live="polite"></div><p class="cs-note">四层知识结构存在，不代表四层均可作为正式依据。KB-PF-20261029-v1；不是实时法规库，也不覆盖全部私募法规。</p><h3>请求动作与语境决定处置</h3>${tabs('risk',data.risks.map(r=>r.title))}<div class="cs-risk" id="cs-risk" aria-live="polite"></div><p class="cs-note">本地 SQLite 审核：PENDING → NEEDS_INFO → APPROVED / REJECTED。操作人未认证；不是企业审批或法律签核。演示通过仍 release_answer=false，不自动发布答案。</p></section>
 <section class="cs-section" id="cs-6">${heading(6,'让每一项改善，都有分母。','V1.0 → V1.1 → V1.2；原始 v1 口径，保留原始分子分母。')}<p class="cs-disclosure">以上数据来自60条合成业务测试场景，运行模式为MOCK_MODE，且测试集参与了后续迭代。该结果主要反映当前检索、路由、规则及工作流的优化情况，不代表真实大模型生成质量或生产环境效果。</p>${tabs('version',['V1.0','V1.1','V1.2'])}<div id="cs-version-note" class="cs-version-note" aria-live="polite"></div><div id="cs-metrics"></div><p class="cs-source">依据：09 / 04_评测与效果迭代报告.md；08 / data / 效果对比.json。最终 59 完全正确、1 部分、0 错误；包含正确拒答、待核与澄清。RSK006 已正确拒答但未命中固定措辞，保留部分正确。</p><details class="cs-details"><summary>评分口径与补标影响</summary><p>正常问题误拦率越低越好，其余七项越高越好。V1.1 为 58/60 完全、1 部分、1 错误；JSON 的 failed 是严格未通过数，包含部分正确。事后 v2 引用补标使 V1.0 同输出完全通过变为 28/60，但不是 Agent 优化收益，未混入主图。</p></details></section>
 <section class="cs-section" id="cs-7">${heading(7,'从错误输出，追到产品决策。','三个真实 Bad Case：依据 trace 定位，不把证据路由错误笼统归因于 Prompt。')}<div id="cs-bad-cases"></div></section>
 <section class="cs-section" id="cs-8">${heading(8,'能演示什么，也公开尚未做到什么。','真实本地 V1.2 Demo；没有公网 Agent 服务，不提供伪装的在线试用。')}<div class="cs-two">${picture(data.demo,'V1.2 真实工作台')}${picture(data.review,'合成人工审核演示闭环')}</div><details class="cs-details" id="cs-local-guide"><summary>VIEW DEMO GUIDE / 本地启动说明</summary><p>在原 Agent 项目根目录运行下列命令；本作品集不包含 Agent 后端源码。</p><pre>python3 -B 05_Web_Demo/launch.py --mock --port 8080</pre><p>浏览器访问 http://127.0.0.1:8080/；先检查 /health 中 ready=true、mock 模式。日期留空使用已核快照；不输入真实客户或合同信息。审核页为 /reviews，不是正式企业审批。</p><p>演示顺序：季度报告查询 → 省略式追问显示依据不足 → 显式补全主题 → 未上传合同拒绝强答 → 高风险拒答 → 合成冲突人工审核。</p></details><h3>精选项目文档</h3><div class="cs-document-list" id="cs-document-list"></div><h3>已知限制 → 下一步验证</h3><div class="cs-limitations">${[['无真实用户验证','访谈运营与合规支持人员，用脱敏任务验证痛点与 MVP。'],['真实 LLM 效果未验证','冻结新未见题集，再单独测试 LIVE 生成、引用和指令遵循。'],['省略式连续追问未完成','为查询重写、指代消解与上下文补全建立独立验收。'],['不具备实时法规更新','验证来源订阅、版本差异、专业复核与发布治理。'],['本地审核不是正式审批','验证身份权限、授权范围和组织流程，继续禁止自动发布。'],['现有题集参与过迭代','新建未见集，区分开发回归与独立评估；另测性能成本。']].map(([a,b])=>`<div><h4>${a}</h4><p>${b}</p></div>`).join('')}</div><div class="cs-end"><p>有依据地回答。<br><em>有边界地停止。</em></p><button class="cs-solid" data-cs-route="projects">返回项目经历 →</button></div></section>
 </div>`;
 document.body.append(root);
 // 图片与文档查看器使用专用原生 dialog，独立于原项目详情弹窗。
 const viewer=document.createElement('dialog');viewer.className='cs-viewer';viewer.setAttribute('aria-label','项目证据查看器');viewer.innerHTML='<div class="cs-viewer-head"><span>PROJECT EVIDENCE / V1.2</span><button aria-label="关闭证据查看器">关闭 ×</button></div><div class="cs-viewer-body"></div>';document.body.append(viewer);
 viewer.querySelector('button').onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
 function openViewer(html){viewer.querySelector('.cs-viewer-body').innerHTML=html;viewer.showModal();viewer.querySelector('button').focus();}
 function inspect(n,container){container.innerHTML=`<span class="cs-kicker">IMPLEMENTATION / ${esc(n.id)}</span><h3>${esc(n.label)}</h3><dl>${[['作用',n.role],['输入',n.input],['输出',n.output],['设计原因',n.reason],['实际实现',n.module]].map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;}
 // SVG 节点与连线严格复用最终整体架构关系，所有节点可键盘激活。
 const pos={U:[30,40],W:[285,40],G:[540,40],A:[795,40],C:[795,180],R:[540,180],S:[285,180],E:[30,180],M:[30,320],V:[285,320],K:[30,500],Q:[540,500],L:[795,320],H:[795,500]};
 const graph=root.querySelector('#cs-graph');graph.innerHTML=`<svg viewBox="0 0 1050 610" role="group" aria-label="产品实际架构，可点击节点"><defs><marker id="cs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#c91f26"/></marker></defs>${data.edges.map(([a,b])=>{const [x,y]=pos[a],[u,v]=pos[b];return `<path d="M${x+105},${y+36} L${u+105},${v+36}" fill="none" stroke="#c91f26" stroke-opacity=".45" marker-end="url(#cs-arrow)"/>`;}).join('')}${data.architecture.map(n=>{const [x,y]=pos[n.id];return `<g role="button" tabindex="0" aria-label="${esc(n.label)}" data-cs-node="${n.id}"><rect x="${x}" y="${y}" width="210" height="72" rx="4"/><text x="${x+12}" y="${y+22}" class="cs-svg-id">${n.id} / IMPLEMENTED</text><text x="${x+12}" y="${y+48}">${esc(n.label)}</text></g>`;}).join('')}</svg>`;
 inspect(data.architecture[0],root.querySelector('#cs-arch-detail'));inspect(data.workflow[0],root.querySelector('#cs-flow-detail'));
 let zoom=1;root.querySelectorAll('[data-cs-zoom]').forEach(b=>b.onclick=()=>{zoom=b.dataset.csZoom==='0'?1:Math.max(1,Math.min(2.5,zoom+(b.dataset.csZoom==='+'?.25:-.25)));graph.querySelector('svg').style.width=`${zoom*100}%`;});
 const activateNode=id=>{inspect(data.architecture.find(n=>n.id===id),root.querySelector('#cs-arch-detail'));root.querySelectorAll('[data-cs-node]').forEach(n=>n.classList.toggle('selected',n.dataset.csNode===id));};
 root.querySelectorAll('[data-cs-node]').forEach(n=>{n.onclick=()=>activateNode(n.dataset.csNode);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activateNode(n.dataset.csNode);}};});
 root.querySelectorAll('[data-cs-flow]').forEach(b=>b.onclick=()=>{root.querySelectorAll('[data-cs-flow]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));inspect(data.workflow[+b.dataset.csFlow],root.querySelector('#cs-flow-detail'));});
 const versionNotes=['V1.0 / 24 完全、0 部分、36 错误。暴露证据、风险、引用与路由缺口。','V1.1 / 58 完全、1 部分、1 错误。多主题规划、原文特征重排、否定动作及风险对象覆盖。','V1.2 / 59 完全、1 部分、0 错误。补齐逐子题引用门禁、依赖与条件检查；修复原 36 条中的 35 条，无新增失败。'];
 function selectTab(type,i){root.querySelectorAll(`[data-cs-tab="${type}"]`).forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.i===i)));
 if(type==='knowledge'){const k=data.knowledge[i];root.querySelector('#cs-knowledge').innerHTML=`<span class="cs-kicker">${k.count}</span><h3>${k.name}</h3><p>${k.text}</p><small>来源：03_知识库架构图.md / 2026-10-29 快照</small>`;}
 if(type==='risk'){const r=data.risks[i];root.querySelector('#cs-risk').innerHTML=`<span class="cs-risk-state">${r.level} / ${r.action}</span><blockquote>${r.question}</blockquote><p>${r.result}</p><small>最终 Demo 手册的合成演示问题；此为历史案例展示，不执行在线 Agent。</small>`;}
 if(type==='version'){const v=['V1.0','V1.1','V1.2'][i];root.querySelector('#cs-version-note').textContent=versionNotes[i];root.querySelector('#cs-metrics').innerHTML=data.metrics.map(m=>`<div class="cs-metric"><div><h3>${m.label}</h3><small>${m.direction}</small></div><div>${['V1.0',v].map((version,j)=>{const a=m[version];return `<div class="cs-bar-row"><span>${version}</span><div class="cs-bar-track"><div style="width:${a.value*100}%" class="${j?'current':''}"></div></div><strong>${a.numerator}/${a.denominator}</strong><span>${(a.value*100).toFixed(1)}%</span></div>`;}).join('')}</div></div>`).join('');}}
 root.querySelectorAll('[data-cs-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.csTab,+b.dataset.i));selectTab('knowledge',0);selectTab('risk',0);selectTab('version',2);
 root.querySelector('#cs-bad-cases').innerHTML=data.badCases.map((b,i)=>`<article class="cs-bad"><span class="cs-kicker">${b.id}</span><h3>${['检索命中，证据路由却失败','正常法规学习被误拦','复杂问题只回答部分子题'][i]}</h3><blockquote>${esc(b.question)}</blockquote><div class="cs-tabs" role="group" aria-label="${b.id} 分析">${['Before','Root Cause','Product Decision','After'].map((label,j)=>`<button data-cs-bad="${i}" data-phase="${j}" aria-pressed="${j===0}">${label}</button>`).join('')}</div><div id="cs-bad-${i}" class="cs-inspector" aria-live="polite"></div></article>`).join('');
 function badPhase(i,j){const b=data.badCases[i],state=x=>`${x.actual_status} / ${x.actual_action} / ${x.actual_risk_level}`;root.querySelector(`#cs-bad-${i}`).innerHTML=j===0?`<h4>V1.0 · ${esc(state(b.before))}</h4><p>${esc(b.before.failure_reason)}</p>`:j===1?`<h4>Root Cause</h4><p>${esc(b.root)}</p>`:j===2?`<h4>Product Decision / 实际修复模块</h4><p>${esc(b.decision)}</p>`:`<h4>V1.2 · ${esc(state(b.after))}</h4><p>同 v1 回归：${esc(b.after.test_result)}。${esc(b.after.failure_reason||'保留原状态与分母，不虚构真实模型测试。')}</p>`;root.querySelectorAll(`[data-cs-bad="${i}"]`).forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.phase===j)));}
 data.badCases.forEach((_,i)=>badPhase(i,0));root.querySelectorAll('[data-cs-bad]').forEach(b=>b.onclick=()=>badPhase(+b.dataset.csBad,+b.dataset.phase));
 const docButtons=data.documents.map((d,i)=>`<button data-cs-doc="${i}">${esc(d.title)} ↗</button>`);root.querySelector('#cs-document-list').innerHTML=docButtons.join('');root.querySelector('#cs-mermaid-docs').innerHTML=data.documents.map((d,i)=>d.title.includes('图.md')?docButtons[i]:'').join('');
 root.querySelectorAll('[data-cs-doc]').forEach(b=>b.onclick=()=>{const d=data.documents[+b.dataset.csDoc];openViewer(`<h2>${esc(d.title)}</h2><pre>${esc(d.text)}</pre>`);});
 root.querySelectorAll('[data-cs-image]').forEach(b=>b.onclick=()=>openViewer(`<img src="${esc(b.dataset.csImage)}" alt="真实 V1.2 合成验收截图">`));
 root.querySelectorAll('[data-cs-anchor]').forEach(b=>b.onclick=()=>root.querySelector(`#cs-${b.dataset.csAnchor}`).scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'}));
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)root.querySelectorAll('[data-cs-anchor]').forEach(b=>b.setAttribute('aria-current',b.dataset.csAnchor===e.target.id.slice(3)?'location':'false'));},{rootMargin:'-20% 0px -60% 0px'});root.querySelectorAll('.cs-section').forEach(s=>observer.observe(s));
 // 只在第二个项目追加入口；不会触碰第一、第三项目的节点。
 const originalOpen=openDetail;
 openDetail=function(section,button){originalOpen(section,button);if(section.id==='projects'){const articles=$('#detail-content').querySelectorAll(':scope > article');const second=articles[1];if(second&&!second.querySelector('.cs-entry')){const b=document.createElement('button');b.className='cs-entry';b.textContent='查看完整项目案例 ↗';b.onclick=()=>{listY=dialog.scrollTop;caseY=0;history.replaceState({listScroll:listY},'','#projects');history.pushState({caseStudy:true},'','#case/private-fund-agent');route();};second.append(b);}}};
 let homeY=0, caseY=0, listY=0, currentRoute=null;
 function route(){if(currentRoute===location.hash)return;currentRoute=location.hash;if(!root.hidden&&location.hash!=='#case/private-fund-agent')caseY=window.scrollY;const isCase=location.hash==='#case/private-fund-agent',isProjects=location.hash==='#projects';
 if(isCase||isProjects){clearTimeout(leaveTimer);intro.hidden=true;intro.classList.remove('leaving');video.pause();$('#home').inert=false;}
 if(isCase){homeY=window.scrollY;if(dialog.open)dialog.close();$('#home').style.display='none';root.hidden=false;document.body.style.overflow='';window.scrollTo(0,caseY);setTimeout(()=>root.querySelector('h1').focus({preventScroll:true}),0);}
 else {const wasCase=!root.hidden;root.hidden=true;$('#home').style.display='';if(viewer.open)viewer.close();if(isProjects){if(!dialog.open){const section=config.sections.find(s=>s.id==='projects');openDetail(section,$('.ticket[data-id="projects"]'));dialog.scrollTop=history.state?.listScroll||listY;}}else if(dialog.open)dialog.close();if(wasCase)window.scrollTo(0,homeY);}}
 root.querySelectorAll('[data-cs-route]').forEach(b=>b.onclick=()=>{history.pushState({},'',b.dataset.csRoute==='projects'?'#projects':'#home');route();});
 addEventListener('popstate',route);addEventListener('hashchange',()=>{if(location.hash==='#projects'||location.hash==='#case/private-fund-agent'||location.hash==='#home')route();});route();
}

// 三份荣誉材料复用同一个预览 dialog，保留原荣誉弹窗、滚动位置及入口焦点。
function setupAwardCertificate() {
  const materials = new Map(config.honors.filter(item => item.certificate).map(item => [item.certificate.id, item.certificate]));
  if (!materials.size) return;
  const layer = document.createElement('dialog');
  layer.className = 'ar-certificate';
  layer.setAttribute('aria-label', '荣誉证明材料预览');
  layer.innerHTML = `<div class="ar-certificate-head"><span data-ar-title></span><div><button type="button" data-ar-zoom aria-pressed="false">放大查看 +</button><button type="button" data-ar-close aria-label="关闭证明材料">关闭 ×</button></div></div><div class="ar-certificate-status" role="status" aria-live="polite"></div><button type="button" data-ar-retry hidden>重新加载图片</button><div class="ar-certificate-image"></div>`;
  document.body.append(layer);
  const container = layer.querySelector('.ar-certificate-image');
  const status = layer.querySelector('.ar-certificate-status');
  const retry = layer.querySelector('[data-ar-retry]');
  const zoomButton = layer.querySelector('[data-ar-zoom]');
  let trigger, backdropDown = false, previousOverflow, listScroll = 0, selected, exiting = false;
  function loadImage() {
    const image = new Image();
    image.alt = selected.alt;
    image.hidden = true;
    status.textContent = '正在加载证明材料…';
    status.hidden = false;
    retry.hidden = true;
    zoomButton.disabled = true;
    container.replaceChildren(image);
    // 每次创建新的图片节点，旧请求不能将另一个材料的加载状态覆盖回来。
    image.onload = () => {
      if (container.firstElementChild !== image) return;
      image.hidden = false;
      status.hidden = true;
      zoomButton.disabled = false;
    };
    image.onerror = () => {
      if (container.firstElementChild !== image) return;
      image.hidden = true;
      status.textContent = '图片暂时无法加载，请重新加载或关闭后再试。';
      retry.hidden = false;
    };
    image.src = selected.src;
  }
  function closePreview() {
    if (!layer.open || exiting) return;
    exiting = true;
    layer.classList.add('ar-exiting');
    setTimeout(() => {
      layer.close();
      document.body.style.overflow = previousOverflow;
      dialog.scrollTop = listScroll;
      trigger?.focus({preventScroll:true});
      layer.classList.remove('ar-exiting');
      exiting = false;
    }, reducedMotion.matches ? 0 : 160);
  }
  $('#detail-content').addEventListener('click', event => {
    const button = event.target.closest('[data-ar-certificate]');
    if (!button || layer.open || exiting) return;
    selected = materials.get(button.dataset.arCertificate);
    if (!selected) return;
    event.stopPropagation();
    trigger = button;
    listScroll = dialog.scrollTop;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    layer.dataset.material = selected.id;
    layer.querySelector('[data-ar-title]').textContent = selected.title;
    layer.classList.remove('ar-zoomed', 'ar-exiting');
    zoomButton.setAttribute('aria-pressed','false');
    zoomButton.textContent = '放大查看 +';
    loadImage();
    layer.showModal();
    layer.scrollTop = 0;
    layer.querySelector('[data-ar-close]').focus({preventScroll:true});
  });
  retry.onclick = loadImage;
  layer.querySelector('[data-ar-close]').onclick = closePreview;
  zoomButton.onclick = event => {
    const zoomed = layer.classList.toggle('ar-zoomed');
    event.currentTarget.setAttribute('aria-pressed',String(zoomed));
    event.currentTarget.textContent = zoomed ? '适应屏幕 −' : '放大查看 +';
  };
  const outside = event => { const r=layer.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom; };
  layer.addEventListener('pointerdown',event=>{backdropDown=event.target===layer&&outside(event);event.stopPropagation();});
  layer.addEventListener('click',event=>{if(backdropDown&&event.target===layer&&outside(event))closePreview();event.stopPropagation();});
  layer.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();closePreview();});
}

// AccessRoute 独立案例：复用 cs 视觉规范，所有新增交互使用 ac-* 命名。
function setupAccessRouteCase() {
 const data=config.accessRouteCase;if(!data)return;
 const esc=escapeHTML,home=$('#home');
 const root=document.createElement('section');root.id='ac-case';root.className='cs ac-case';root.hidden=true;
 const names=['PROJECT OVERVIEW','USER RESEARCH & PROBLEM','PRODUCT SOLUTION & JOURNEY','AI ARCHITECTURE & DECISIONS','INTERACTIVE SHOWCASE','VALIDATION & API ECONOMICS','OUTCOME & REFLECTION'];
 const head=(i,t,p)=>`<div class="cs-section-head"><span class="cs-index">${String(i).padStart(2,'0')}</span><div><div class="cs-kicker">${names[i-1]}</div><h2>${t}</h2><p>${p}</p></div></div>`;
 const link=(key,label)=>`<a class="ac-link" href="${data.links[key]}" target="_blank" rel="noopener noreferrer">${label}</a>`;
 const picture=(src,label,mobile=false)=>`<button class="cs-picture${mobile?' ac-mobile-shot':''}" data-ac-image="${src}" data-ac-format="${mobile?'mobile':'showcase'}" aria-label="放大查看${esc(label)}"><span class="cs-image-label">${mobile?'MOBILE FRONTEND':'PUBLIC SHOWCASE / PRESET STATE'} <b>查看原图 ↗</b></span><img src="${src}" alt="${esc(label)}" loading="lazy"></button>`;
 const tabs=(type,labels)=>`<div class="cs-tabs" role="group" aria-label="${type}">${labels.map((t,i)=>`<button data-ac-tab="${type}" data-i="${i}" aria-pressed="${i===0}">${t}</button>`).join('')}</div>`;
 root.innerHTML=`<div class="cs-top"><span>张嘉铭 / CASE FILE 01</span><div><button data-ac-route="projects">← 返回项目经历</button><button data-ac-route="home">个人档案馆 ↗</button></div></div><nav class="cs-nav" aria-label="AccessRoute 案例章节">${names.map((n,i)=>`<button data-ac-anchor="${i+1}" aria-current="${i===0?'location':'false'}">${String(i+1).padStart(2,'0')} <span>${n.split(' & ')[0]}</span></button>`).join('')}</nav><div class="cs-body">
 <section class="cs-section" id="ac-1"><div class="cs-kicker">TEAM 1022 HUMANROUTE / GOLD PRIZE / AI PRODUCT CASE STUDY</div><h1 tabindex="-1">ACCESSROUTE <em>HK</em></h1><div class="cs-hero-grid"><div><h2>AI-powered Accessible Navigation</h2><p class="cs-lead">最短的路，<br>未必是走得通的路。</p><p>面向轮椅用户、行动不便长者、推婴儿车家庭与大件行李旅客，把香港的楼层、电梯、连廊与街道连接为可理解的旅程。</p><p>行动约束决定哪些路可走；地图引擎计算路线；GenAI 辅助理解需求、观察照片与解释下一步。</p><dl><dt>我的参与</dt><dd>用户需求与产品方案、自然语言需求理解与路线解释 Prompt 设计调试、竞品分析、原型及核心 Demo 协作。</dd><dt>团队成果</dt><dd>2026 Inter-University GenAI Hackathon for the SDGs<br>Green Transport & Smart Mobility · Gold Prize</dd></dl><p class="cs-note">个人参与聚焦产品与交互；路径引擎、工程实现及回归验证为团队协作成果。</p><div class="ac-links">${link('demo','Explore Live Demo ↗')}${link('github','View GitHub Repository ↗')}<span class="ac-resource-pair">${link('ppt','View Presentation ↗')}${link('video','Watch Demo Video ↗')}</span></div><small>Showcase 是预设状态回放，不代表所有 AI 功能可在线实时调用；PPTX 为原比赛演示文件；视频为项目官网的完整演示录屏。</small></div><div>${picture(data.hero,'轮椅需要已应用的真实 Showcase')}<p class="cs-source">采自公开 Showcase；需要、天气与 AI 结果预设，本地路径计算真实执行。画面不是实地安全认证。</p></div></div><div class="cs-strip"><span><b>110</b>份团队初步问卷</span><span><b>4</b>类 AI 工作流</span><span><b>12</b>个登记场景</span><span><b>GOLD</b>团队赛道金奖</span></div></section>
 <section class="cs-section" id="ac-2">${head(2,'把最后一段路，定义为产品问题。','团队问卷反映需求与偏好，不能替代对产品有效性的真实用户测试。')}<div class="cs-two"><div class="cs-column"><h3>用户经历的断点</h3><p>正确楼层与出口不清楚；电梯难找或停用；室内位置不确定；雨天绕行增加负担。九龙塘现场记录呈现了楼梯与露天路径，以及商场电梯连廊的替代机会。</p><p>轮椅用户的楼梯是不可通行约束；长者更在意坡度、体力与理解成本；推车家庭需要可使用的垂直设施。相同目的地并不意味着相同路线。</p></div><div class="cs-column"><h3>调研如何影响优先级</h3><p>110 份团队初步有效问卷，结合公共资料与既有地图/场所指南的定性对比，将“楼层与设施上下文”及“个性化行动约束”设为核心；照片辅助与语音交互服务于这条主旅程。</p><small>不公开原始问卷或个人信息，不编造访谈原话和问卷比例；目标群体的任务试验仍需进一步开展。</small></div></div><div class="ac-opportunities">${[['台阶阻断路径','硬约束先于距离排序'],['电梯不可用','确认设施 → 限时事件 → 重算'],['楼层与位置不明','地标候选 → 用户确认'],['无法持续看屏幕','短句粤语指引与重播']].map(([a,b])=>`<div><h3>${a}</h3><span>产品机会 →</span><p>${b}</p></div>`).join('')}</div><details class="cs-details"><summary>竞品研究的边界与差异化</summary><p>团队资料对比了通用地图、HKeMobility、港铁设施信息及现场标识。它们分别提供路线或设施线索；本项目探索把跨楼层行动约束、已确认设施事件与路线恢复串在同一旅程。此为资料层面的定性分析，不是对所有竞品的实测优劣排名。</p></details></section>
 <section class="cs-section" id="ac-3">${head(3,'先能通行，再谈更快。','手机端以地图为主，底部卡片随旅程切换：选地点、设偏好、比路线、导航，必要时原地求助。')}<div class="cs-workflow-layout"><div class="cs-steps" id="ac-journey-buttons"></div><div class="cs-inspector ac-journey-inspector" id="ac-journey-panel" aria-live="polite"></div></div><p class="cs-source">配图来自新版手机前端的本地运行，使用同一条 PopCorn 2 至希慎广场演示旅程。地铁连接基于保存的站序，设施状态、通行属性与班次仍需核实。</p><h3>一个明确的产品取舍</h3>${tabs('route',['先判断能否通行','再比较路线偏好'])}<div class="cs-inspector" id="ac-route-panel" aria-live="polite"></div></section>
 <section class="cs-section" id="ac-4">${head(4,'让 AI 理解，让规则决定。','四类工作流中，用户确认是识别结果进入路由的边界。')}<div class="cs-two"><div class="cs-column"><h3>LLM / Vision Model</h3><p>理解日常语言、提取图像线索、匹配地图候选、把路线事实转成粤语表达。Prompt 明确输入、结构字段与输出边界。</p></div><div class="cs-column"><h3>确定性引擎 + 用户</h3><p>算法负责硬约束、路径搜索、设施禁用和重算；用户确认歧义字段、设施与位置。无可行路线时不靠生成文本“补出”一条路。</p></div></div>${tabs('flow',data.flows.map(f=>f.name))}<div class="cs-kicker" id="ac-flow-title"></div><div class="ac-flow-layout"><div class="ac-flow-buttons" id="ac-flow-buttons"></div><div class="cs-inspector" id="ac-flow-panel" aria-live="polite"></div></div><p class="cs-source">依据：公开技术页面、比赛产品手册及当前仓库说明。此为设计交互说明，不是实时模型执行轨迹。具体模块可运行范围以对应服务配置和版本为准。</p></section>
 <section class="cs-section" id="ac-5">${head(5,'在一个具体旅程里，看见产品响应。','五种状态均为公开 Showcase 的真实截图，AI 观察、天气和事件预设。')}<div class="ac-showcase-tabs">${data.scenes.map((s,i)=>`<button data-ac-scenario="${i}" aria-pressed="${i===0}">${String(i+1).padStart(2,'0')} / ${s.title}</button>`).join('')}</div><div id="ac-showcase-panel" aria-live="polite"></div><div class="ac-links">${link('demo','Explore Interactive Showcase ↗')}</div><p class="cs-note">Showcase 在静态前端运行：预设输入与识别结果，本地引擎计算路径，预录粤语音频。需要实时模型、天气或后端的完整功能不能由该页面单独证明。</p></section>
 <section class="cs-section" id="ac-6">${head(6,'验证有口径，成本有假设。','把开发回归、用户试验、预算和实际账单分开。')}<div class="cs-strip"><span><b>12</b>登记场景</span><span><b>132</b>自动回归通过</span><span><b>14</b>普通行程预算调用</span><span><b>$0.020640</b>USD / 指定假设行程</span></div><p class="cs-disclosure">132 项是 2026-10-18 公开记录中的软件自动化回归，覆盖路由、事件、HTTP 与会话，不是132名用户或模型准确率。成本按2026-10-11历史价格与指定Token预算估算，不等于生产成本、实际运营成本或真实用户平均成本。</p><h3>一次行程，哪些动作值得调用模型？</h3>${tabs('cost',['普通导航','增加一次定位','定位 + 障碍照片'])}<div class="ac-cost-grid"><div id="ac-cost-panel" class="cs-inspector" aria-live="polite"></div><div class="cs-column"><h3>成本控制的产品决策</h3><p>本地路径搜索、用户确认与会话同步不增加 GenAI 调用。文本与视觉模型分工，按需请求照片；结构化字段及地图ID校验减少不必要的重试与错误更新。</p><p>通用场景说明不宣称已实现生产缓存收益。缓存/复用应结合有效期、用户许可与变更后的路线事实验证；不能复用已经失效的导航指引。</p><small>预算仅含模型推理。地图、托管、存储、语音与路线维护属于其他服务成本；视觉流程含观察与匹配两次顺序调用。</small></div></div><div class="ac-links">${link('cost','Explore AI API Cost Analysis ↗')}</div><details class="cs-details"><summary>为什么不展示“模型准确率已达标”？</summary><p>技术报告中的字段、位置及指引准确率是验收目标，并非已取得成绩。约3.4秒记录仅为一次不同任务的通用文本连通样本，不作导航平均时延；完整任务的样本量、中位数、p95与失败率仍需测量。</p></details><h3>商业可行性仍是待验证假设</h3><p>比赛PPT提出用户免费、场地方建设与维护支持、政府采购/资助及NGO赞助。尚未据此声称有付费客户、收入、采购合同或已验证定价；下一步应以场地维护成本与目标用户任务价值共同验证。</p></section>
 <section class="cs-section" id="ac-7">${head(7,'金奖是阶段结果，可信仍需持续验证。','2026 Inter-University GenAI Hackathon for the SDGs · Green Transport & Smart Mobility · Team 1022 HumanRoute · Gold Prize')}<div class="ac-stages"><div><span>比赛方案</span><h3>需求与原型</h3><p>110份团队初步问卷、产品方案、原型与比赛演示；不是正式目标用户效果试验。</p></div><div><span>后续工程记录</span><h3>12 场景 / 132 检查</h3><p>公开的版本化软件回归记录，不代表真实用户成功率或现场通行认证。</p></div><div><span>当前可演示</span><h3>公开 Showcase 与手机前端</h3><p>公开版提供预设场景回放；手机前端可在本地比较路线、手动推进导航和打开求助。实时 AI 需要配置服务。</p></div></div><div class="cs-limitations">${[['无障碍路网属性','现场核实出入口、坡度、通行权与电梯状态；不把官方几何自动等同可达性认证。'],['设施状态与服务能力','模拟关闭验证恢复逻辑，真实更新、误报处理与生产服务等级仍需试点。'],['视觉与端到端指标','建立标注照片集及真实场地任务测试，报告准确率、完成率与失败路径。'],['不同人群的可理解性','与轮椅使用者、长者、照护者开展针对性访谈与任务实验；提高免持续看屏幕的音频指引。'],['缺传感器建筑的定位','验证地标辅助、人工确认与请求帮助的降级方案，不承诺连续实时定位。'],['下一步试点','先让一位目标用户完成一条核验路线、恢复一次模拟中断，并理解系统不确定性。']].map(([a,b])=>`<div><h4>${a}</h4><p>${b}</p></div>`).join('')}</div><div class="cs-note"><b>Product Reflection</b><p>将 GenAI 放进明确边界：用它增强理解与交互，用可核对的数据、确定性规则和人工确认控制导航风险。产品价值来自用户能否完成旅程，而不是模型调用数量。</p></div><div class="cs-end"><p>AI 增强理解。<br><em>产品守住边界。</em></p><button class="cs-solid" data-ac-route="projects">返回项目经历 →</button></div></section></div>`;
 document.body.append(root);
 const viewer=document.createElement('dialog');viewer.className='cs-viewer ac-viewer';viewer.setAttribute('aria-label','AccessRoute 产品截图预览');viewer.innerHTML='<div class="cs-viewer-head"><span>ACCESSROUTE / PRESET SHOWCASE</span><button aria-label="关闭AccessRoute截图">关闭 ×</button></div><div class="cs-viewer-body"></div>';document.body.append(viewer);viewer.querySelector('button').onclick=()=>viewer.close();viewer.onclick=e=>{if(e.target===viewer)viewer.close();};
 let viewerOverflow='';
 // 原生dialog约束键盘焦点；另行锁定背景滚动，关闭后尊重仍打开的项目列表。
 viewer.addEventListener('close',()=>{document.body.style.overflow=dialog.open?'hidden':viewerOverflow;});
 // 图片查看只复用原有视觉；动态场景图片使用事件委托，切换后仍可放大。
 root.addEventListener('click',e=>{const b=e.target.closest('[data-ac-image]');if(b&&!viewer.open){viewerOverflow=document.body.style.overflow;document.body.style.overflow='hidden';viewer.dataset.format=b.dataset.acFormat;viewer.querySelector('.cs-viewer-body').innerHTML=`<img src="${esc(b.dataset.acImage)}" alt="${esc(b.querySelector('img').alt)}">`;viewer.showModal();viewer.querySelector('button').focus();}});
 // 每一步使用单独的手机实拍界面，避免用通用演示图替代具体操作。
 const journey=data.journey;
 root.querySelector('#ac-journey-buttons').innerHTML=journey.map((j,i)=>`<button data-ac-journey="${i}" aria-pressed="${i===0}"><span>${String(i+1).padStart(2,'0')}</span>${esc(j.title)} ↓</button>`).join('');
 const state={flow:0,node:0};
 function flowNode(i){state.node=i;const n=data.flows[state.flow].steps[i];root.querySelector('#ac-flow-panel').innerHTML=`<span class="cs-kicker">${data.flows[state.flow].title}</span><h3>${n.label}</h3><dl>${[['输入',n.input],['模型 / 算法职责',n.role],['输出',n.output],['设计原因',n.why],['失败 / 低置信度',n.failure]].map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;root.querySelectorAll('[data-ac-node]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.acNode===i)));}
 function select(type,i){root.querySelectorAll(`[data-ac-tab="${type}"]`).forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.i===i)));
 if(type==='flow'){state.flow=i;root.querySelector('#ac-flow-title').textContent=data.flows[i].title;root.querySelector('#ac-flow-buttons').innerHTML=data.flows[i].steps.map((n,j)=>`<button data-ac-node="${j}" aria-pressed="${j===0}"><span>${String(j+1).padStart(2,'0')}</span><b>${n.label}</b><span>↓</span></button>`).join('');flowNode(0);}
 if(type==='route'){root.querySelector('#ac-route-panel').innerHTML=`<span class="cs-kicker">ROUTING DECISION / 产品逻辑</span><h3>${i?'在可行集合内选择较短或有盖路线':'先排除不满足行动约束的路径'}</h3><p>${i?'较短选项与有盖选项均须满足同一组约束。示例中有盖路线步行多 64 米，用户可根据天气与体力选择；偏好不会把不可通行的路重新纳入。':'轮椅画像避开楼梯；升降机停用或坡度超限时，相应路段不参与计算。若没有可行路线，界面明确提示并阻止开始导航。'}</p>`;}
 if(type==='cost'){const workload=[[1,13,0,0],[1,13,1,0],[1,15,1,1]][i];const [p,g,l,o]=workload;const calls=p+g+2*l+2*o,input=1200*p+450*g+4200*l+4800*o,output=180*p+70*g+560*l+640*o,cost=.00348*p+.00132*g+.006032*l+.007088*o;root.querySelector('#ac-cost-panel').innerHTML=`<span class="cs-kicker">历史价格预算 / 非实际账单</span><div class="ac-cost-total">$${cost.toFixed(6)}<small>USD / 指定假设行程</small></div><dl><dt>偏好 / 指引</dt><dd>${p}次偏好解析 + ${g}句指引</dd><dt>定位 / 障碍</dt><dd>${l}次地标照片 + ${o}次障碍照片</dd><dt>模型调用</dt><dd>${calls}次</dd><dt>Token预算</dt><dd>${input.toLocaleString()}输入 / ${output.toLocaleString()}输出</dd></dl><p class="cs-source">文本Qwen3.8-Max、视觉Qwen3-VL-Plus的报告历史价格；输入和输出单独计价。成本来自公开预算表，不是用户平均花费。</p>`;}}
 root.querySelectorAll('[data-ac-tab]').forEach(b=>b.onclick=()=>select(b.dataset.acTab,+b.dataset.i));select('flow',0);select('route',0);select('cost',0);
 function selectJourney(i){const j=journey[i];root.querySelectorAll('[data-ac-journey]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.acJourney===i)));root.querySelector('#ac-journey-panel').innerHTML=`<div class="ac-journey-detail"><span class="cs-kicker">MOBILE JOURNEY / ${String(i+1).padStart(2,'0')}</span><h3>${esc(j.title)}</h3><p>${esc(j.description)}</p></div><figure class="ac-mobile-figure">${picture(j.image,j.alt,true)}<figcaption class="cs-source">${esc(j.caption)}</figcaption></figure>`;}
 root.querySelectorAll('[data-ac-journey]').forEach(b=>b.onclick=()=>selectJourney(+b.dataset.acJourney));selectJourney(0);
 function selectScenario(i){const s=data.scenes[i];root.querySelectorAll('[data-ac-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.acScenario===i)));root.querySelector('#ac-showcase-panel').innerHTML=`<div class="cs-hero-grid"><div><span class="cs-kicker">${s.status}</span><h3>${s.title}</h3><dl>${[['User Pain Point',s.pain],['Product Response',s.response],['AI / Routing',s.contribution],['Demo State',s.result]].map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></div>${picture(s.image,s.title+'真实预设画面')}</div>`;}
 root.querySelectorAll('[data-ac-scenario]').forEach(b=>b.onclick=()=>selectScenario(+b.dataset.acScenario));selectScenario(0);
 root.addEventListener('click',e=>{const b=e.target.closest('[data-ac-node]');if(b)flowNode(+b.dataset.acNode);});
 root.querySelectorAll('[data-ac-anchor]').forEach(b=>b.onclick=()=>root.querySelector('#ac-'+b.dataset.acAnchor).scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth'}));
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)root.querySelectorAll('[data-ac-anchor]').forEach(b=>b.setAttribute('aria-current',b.dataset.acAnchor===e.target.id.slice(3)?'location':'false'));},{rootMargin:'-20% 0px -60% 0px'});root.querySelectorAll('.cs-section').forEach(s=>observer.observe(s));
 // 独立hash视图与既有私募Agent路由协作：通过同一popstate通知原路由，避免重加载页面。
 let homeY=0,caseY=0,listY=0,lastHash=null;
 const notify=()=>window.dispatchEvent(new PopStateEvent('popstate'));
 const previousOpen=openDetail;
 openDetail=function(section,button){previousOpen(section,button);if(section.id==='projects'){const first=$('#detail-content').querySelector(':scope>article');if(first&&!first.querySelector('.ac-entry')){const b=document.createElement('button');b.className='cs-entry ac-entry';b.textContent='查看完整项目案例 ↗';b.onclick=()=>{listY=dialog.scrollTop;caseY=0;history.replaceState({listScroll:listY},'','#projects');history.pushState({accessRoute:true},'','#case/accessroute-hk');notify();};first.append(b);}}};
 function apply(){const hash=location.hash;if(hash===lastHash)return;lastHash=hash;const active=hash==='#case/accessroute-hk';if(active){homeY=window.scrollY;clearTimeout(leaveTimer);intro.hidden=true;intro.classList.remove('leaving');video.pause();home.inert=false;if(dialog.open)dialog.close();home.style.display='none';root.hidden=false;document.body.style.overflow='';window.scrollTo(0,caseY);setTimeout(()=>root.querySelector('h1').focus({preventScroll:true}),0);}else if(!root.hidden){caseY=window.scrollY;root.hidden=true;if(viewer.open)viewer.close();if(hash==='#projects'){if(dialog.open){dialog.scrollTop=history.state?.listScroll||listY;}}else if(hash!=='#case/private-fund-agent'){home.style.display='';window.scrollTo(0,homeY);}}}
 root.querySelectorAll('[data-ac-route]').forEach(b=>b.onclick=()=>{history.pushState({listScroll:listY},'',b.dataset.acRoute==='projects'?'#projects':'#home');notify();});
 addEventListener('popstate',apply);addEventListener('hashchange',()=>{if(location.hash==='#case/accessroute-hk')notify();else apply();});apply();
 // 刷新#projects时原弹窗可能早于新模块创建，补齐第一项目入口。
 if(location.hash==='#projects'&&dialog.open)openDetail(config.sections.find(s=>s.id==='projects'),$('.ticket[data-id="projects"]')); 
}

// PROJECT 03 复用案例样式和项目弹窗的历史记录约定。
function setupCustomerCase() {
  const route = '#case/365-customer-service';
  const assetRoot = './projects/365/';
  const assets = config.customerCase || {};
  const esc = escapeHTML;
  const chapterNames = ['PROJECT OVERVIEW', 'USER PROBLEM & PRODUCT STRATEGY', 'PRODUCT SOLUTION',
    'AI WORKFLOW & ARCHITECTURE', 'INTERACTIVE DEMO', 'EVALUATION & RELIABILITY', 'PRODUCT REFLECTION & ROADMAP'];
  const problems = [
    ['重复咨询与信息分散', '规格、配送和购买条件散落在不同页面。', '买家首先需要知道正在问哪件商品、哪项政策。', '统一三语 FAQ 与商品别名，再按意图匹配资料。'],
    ['推荐缺乏上下文', '只提供预算时，系统无法推断买家需要零食还是韩妆。', '预算与品类共同决定候选范围。', '逐轮补齐缺失信息，再按实际目录价筛选。'],
    ['错误回答带来业务风险', '猜测规格、价格、订单或退款条件会影响购买决策。', '政策可以检索，订单状态必须通过授权查询。', '模型输出候选，服务端按目录、政策和订单记录校验。'],
    ['复杂售后需要人工协同', '投诉、异常包裹与退款请求需要后续处理。', '系统应明确下一步和处理状态。', '独立设置转接规则，模拟工单记录原因和状态。']
  ];
  const scenarios = [
    ['产品咨询', 'Product Inquiry', '“비비고 김 상품 정보”', '识别韩文商品别名并匹配目录。', '按商品 ID 返回规范资料，未知规格走证据不足处理。', 'C040 命中 FOOD-03，返回必品阁烤海苔演示商品卡。'],
    ['套餐推荐', 'Bundle Recommendation', '“推荐套餐” → “100 元” → “韩妆”', '先追问人民币预算，再确认品类。', '核对套餐组件、折扣和规范价格，等于预算可推荐。', 'C045 两次补槽后返回 80 元的韩妆入门套餐。'],
    ['物流查询', 'Order Tracking', '“查询订单 OK-1003 DEMO-7087”', '后端核对演示单号和查询码，返回事件时间线。', '错误凭证和订单不存在使用统一答复。模拟订单与真实承运商隔离。', 'C052 显示异常物流并创建模拟工单。'],
    ['人工转接', 'Human Handoff', '“帮我找人工客服”', '识别主动请求，记录原因并返回工单号。', '知识不足、异常售后或系统错误也可触发升级。工单只在演示队列排队。', 'C064 返回 queued 状态及工单编号。']
  ];
  const workflow = [
    ['用户输入', '中、韩、英文本与当前会话 → 脱敏查询及必要上下文', '将用户需求与受保护的订单凭证分开。', 'Live 设计仅传脱敏 sys.query、context_json 和凭证有无。', '订单号及查询码由服务端留在原请求中。'],
    ['意图识别', '查询 → intent、domain、mixed', '区分商品事实、套餐决策、动态订单与转接。', '离线由规则分类。Live 设计采用低温度结构化分类。', '混合任务请求拆分，主动转接优先。'],
    ['槽位提取', '查询及会话 → ids、budget、use', '减少预算、品类不完整导致的错荐。', '提取人民币预算和合法品类，记录跨轮上下文。', '缺槽位逐项追问。非法币种或负数需要澄清。'],
    ['场景路由', '意图与知识域 → 业务分支', '不同问题需要不同证据与处理路径。', 'Dify If-Else 设计优先判断混合或人工，再走订单、套餐、政策或商品。', '不明确的任务进入澄清或异常分支。'],
    ['检索或规则处理', 'search_query 或凭证 → 候选资料或业务记录', '静态知识与授权的动态订单采用不同机制。', 'KB01 商品信息，KB02 套餐推荐，KB03 物流、清关与售后政策。订单由后端处理。', '未知事实提示缺证据。凭证不符时统一答复。'],
    ['结构化输出', '分支候选 → 约定 JSON', '让服务端能校验模型的选择并稳定渲染。', 'Live 分支 Answer 只返回 JSON，引用使用资料的 Source ID。', '无效 JSON、非 2xx 或超时触发异常处理。'],
    ['可信事实校验', '候选 ID、预算及原请求 → 已核验业务数据', '限制生成文本对价格、规格、订单状态的影响。', '按规范目录、政策白名单、套餐组件与订单凭证核对。', '槽位忠实度和跨轮覆写仍待 Live 联调验证。'],
    ['答复或转接', '已核验结果或风险原因 → 商品卡、事件时间线或工单', '让用户知道依据、结果与下一步。', '工作台显示规范业务记录和模拟队列状态。', '复杂售后、缺证据或异常创建模拟工单。']
  ];
  const cases = [
    ['C040 · 韩文商品匹配', '비비고 김 상품 정보', '命中 FOOD-03 并返回商品卡。', '返回韩文提示及必品阁烤海苔卡片，来源 FOOD-03。'],
    ['C045 · 多轮补槽', '推荐套餐 → 100 元 → 韩妆', '两次澄清后返回 BEAUTY-LITE。', '依次追问预算和品类，最终返回 80 元韩妆入门套餐。'],
    ['C041 / C042 · 预算边界', '零食套餐预算 32 元 / 31.99 元', '等于价格可推荐，低于价格应无候选。', '32 元命中 SNACK-LITE，31.99 元返回无匹配。'],
    ['C060 · 物流凭证', '查订单 OK-1002 DEMO-7013', '错误组合与订单不存在得到统一状态。', '返回 not_found，提示未找到订单或查询码不匹配。'],
    ['C052 · 异常升级', '查询订单 OK-1003 DEMO-7087', '返回异常时间线并创建模拟工单。', '返回 exception，创建 queued 工单。'],
    ['C073 · 跨轮语言切换', '英文询问奶油火鸡面 → “它的规格？”', '切换到中文时保留正确商品上下文。', '两轮均返回 FOOD-02，第二轮以中文回复。']
  ];
  const root = document.createElement('main');
  root.className = 'cs customer-case';
  root.id = 'customer-case';
  root.hidden = true;
  const head = (n, title, description) => `<div class="cs-section-head"><span class="cs-index">${String(n).padStart(2, '0')}</span><div><div class="cs-kicker">${chapterNames[n - 1]}</div><h2>${title}</h2><p>${description}</p></div></div>`;
  const buttons = (key, labels) => labels.map((label, index) => `<button type="button" data-customer-group="${key}" data-choice="${index}" aria-pressed="${index === 0}">${esc(label)}</button>`).join('');
  const rows = pairs => `<dl>${pairs.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
  const demoUrl = assets.demoHtml ? URL.createObjectURL(new Blob([assets.demoHtml], { type: 'text/html;charset=utf-8' })) : assetRoot + 'customer-demo.html';
  const screenshot = assets.hero || assetRoot + 'workspace-preview.png';

  root.innerHTML = `
    <div class="cs-top"><span>张嘉铭 / CASE FILE 03</span><div><button data-customer-route="projects">← 返回项目经历</button><button data-customer-route="home">个人档案馆 ↗</button></div></div>
    <nav class="cs-nav" aria-label="365 案例章节">${chapterNames.map((name, index) => `<button data-customer-anchor="${index + 1}" aria-label="${String(index + 1).padStart(2, '0')} ${name}" aria-current="${index === 0 ? 'location' : 'false'}">${String(index + 1).padStart(2, '0')} <span>${name.split(' & ')[0]}</span></button>`).join('')}</nav>
    <div class="cs-body">
      <section class="cs-section" id="customer-1">
        <div class="cs-kicker">365 / AI PRODUCT CASE STUDY</div>
        <h1 tabindex="-1">365 CROSS-BORDER<br><em>AI CUSTOMER SERVICE</em></h1>
        <div class="cs-hero-grid"><div>
          <h2>面向韩国商品跨境购物的多语言智能客服与人机协同系统</h2>
          <p>买家在选购韩国食品、韩妆、保健品和生活用品时，需要核对规格、预算和运输政策。订单异常与复杂售后则需要可追踪的后续处理。</p>
          ${rows([['产品策略', '理解意图 · 获取证据 · 安全转接'], ['我的工作', '拆解咨询场景、设计知识域与对话路由、定义事实校验与人工接管条件，搭建演示并评测业务边界。'], ['当前阶段', '个人 AI PM 原型。三语 FAQ 可在线操作，完整工作台已完成本地离线验证，Dify Live 待联调。']])}
          <button class="cs-solid" data-customer-anchor="5">体验客服 Demo ↓</button>
        </div><div>
          <button class="cs-picture" data-customer-image><span class="cs-image-label">LOCAL WORKSPACE / SIMULATED ORDER <b>查看原图 ↗</b></span><img src="${screenshot}" alt="365 本地工作台展示异常订单时间线和模拟工单" loading="lazy"></button>
          <p class="cs-source">本地工作台实际操作截图。异常订单与工单均为演示数据。</p>
        </div></div>
        <div class="cs-strip"><span><b>33</b>条可体验 FAQ</span><span><b>3</b>种界面语言</span><span><b>24</b>个演示 SKU</span><span><b>73</b>条离线合成案例</span></div>
      </section>
      <section class="cs-section" id="customer-2">
        ${head(2, '从买家的决策问题出发。', '以下用户问题和优先级是产品设计假设，等待真实咨询样本和用户测试验证。')}
        <div class="cs-tabs" role="group" aria-label="用户问题">${buttons('problem', problems.map(x => x[0]))}</div>
        <div class="cs-inspector" id="customer-problem" aria-live="polite"></div>
      </section>
      <section class="cs-section" id="customer-3">
        ${head(3, '按场景决定证据与下一步。', '四类场景来自完整本地工作台。下方内嵌版提供 FAQ 自助查询。')}
        <div class="cs-tabs" role="group" aria-label="业务场景">${buttons('scenario', scenarios.map(x => x[0]))}</div>
        <div class="cs-inspector" id="customer-scenario" aria-live="polite"></div>
      </section>
      <section class="cs-section" id="customer-4">
        ${head(4, '把对话路由和业务事实拆开。', '下图对照当前离线规则实现与计划中的 Dify Chatflow。目标实例、真实模型和检索尚待联调。')}
        <div class="cs-workflow-layout">
          <div class="cs-steps" role="group" aria-label="工作流节点">${buttons('workflow', workflow.map((x, index) => `${String(index + 1).padStart(2, '0')} / ${x[0]} ↓`))}</div>
          <div class="cs-inspector" id="customer-workflow" aria-live="polite"></div>
        </div>
        <div class="cs-two customer-decisions"><div class="cs-column"><h3>事实由业务数据决定</h3><p>商品规格、价格、预算计算与订单状态由服务端校验，再按结构化结果展示。</p></div><div class="cs-column"><h3>按场景选择知识与规则</h3><p>商品、套餐、政策使用对应知识域，物流走凭证校验，风险请求进入转接分支。</p></div></div>
      </section>
      <section class="cs-section" id="customer-5">
        ${head(5, '动手试一次三语客服。', '切换中文、한국어或 English，浏览类别、搜索关键词，或输入「韩国直邮多久到？」。')}
        <p>此体验使用浏览器内的 33 条 FAQ 和匹配规则。真实订单和售后请从购买平台处理。</p>
        <a class="ac-link customer-demo-link" href="${demoUrl}" target="_blank" rel="noopener noreferrer">全屏体验 365 智能客服 ↗</a>
        <iframe class="customer-demo" title="365 跨境智能客服互动体验" loading="lazy"></iframe>
      </section>
      <section class="cs-section" id="customer-6">
        ${head(6, '用可复现的案例检查可靠性。', '评测来自独立工作台的 demo / full 离线记录。73 条合成案例与实现共同设计。')}
        <div class="cs-strip"><span><b>41</b>产品咨询</span><span><b>9</b>套餐推荐</span><span><b>13</b>物流查询</span><span><b>4</b>人工转接</span><span><b>6</b>其他场景</span></div>
        <div class="cs-two customer-decisions"><div class="cs-column"><h3>离线验证</h3><p>意图准确率、场景断言通过率和来源命中代理均为 100.0%。来源指标核对目录或政策 ID。</p><p>转接率 17.8%，转接精确率及召回率均为 100.0%。离线完成代理 69.9%。</p></div><div class="cs-column"><h3>测量边界</h3><p>平均响应 0.93 ms，口径为本地 HTTP。向量检索命中率、实际回答正确率、有据回答率与生产自动解决率待验证。</p></div></div>
        <div class="cs-tabs" role="group" aria-label="逐案评测">${buttons('eval', cases.map(x => x[0]))}</div>
        <div class="cs-inspector" id="customer-eval" aria-live="polite"></div>
        <p class="cs-source">来源为项目包的 evaluation.md、results.json、cases.json 和 results-trace.json。</p>
      </section>
      <section class="cs-section" id="customer-7">
        ${head(7, '从能回答，走向可核验、可接管。', '三个产品判断及下一阶段计划。')}
        <div class="cs-limitations"><div><h4>意图理解之后还要选路径</h4><p>分类只有在能路由到正确知识、规则和工具时才有业务价值。</p></div><div><h4>事实先于表达</h4><p>从可信记录生成规范结果，保留证据与核验路径。</p></div><div><h4>转接是产品能力</h4><p>给异常请求定义触发条件、后续责任和状态。</p></div><div><h4>下一阶段计划</h4><p>完成 Dify Live 联调，对比基础模型、统一 RAG 与场景路由。建立独立留出集，开展真实用户测试，再测业务解决率和人工处理效率。</p></div></div>
        <div class="cs-end"><p>理解意图，<br><em>把事实交给证据。</em></p><button class="cs-solid" data-customer-route="projects">返回项目经历 →</button></div>
      </section>
    </div>`;
  document.body.append(root);

  const viewer = document.createElement('dialog');
  viewer.className = 'cs-viewer';
  viewer.setAttribute('aria-label', '365 工作台截图预览');
  viewer.innerHTML = `<div class="cs-viewer-head"><span>365 / LOCAL WORKSPACE</span><button aria-label="关闭365截图">关闭 ×</button></div><div class="cs-viewer-body"><img src="${screenshot}" alt="365 工作台异常订单与模拟工单"></div>`;
  document.body.append(viewer);
  const viewerTrigger = root.querySelector('[data-customer-image]');
  viewerTrigger.onclick = () => viewer.showModal();
  viewer.querySelector('button').onclick = () => viewer.close();
  viewer.onclick = event => { if (event.target === viewer) viewer.close(); };
  viewer.addEventListener('close', () => { if (!root.hidden) viewerTrigger.focus({ preventScroll: true }); });

  const panels = {
    problem: index => rows([['Problem', problems[index][1]], ['Insight', problems[index][2]], ['Solution', problems[index][3]]]),
    scenario: index => rows([['用户问题', scenarios[index][2]], ['产品处理', scenarios[index][3]], ['业务规则', scenarios[index][4]], ['实际演示结果', scenarios[index][5]]]),
    workflow: index => rows([['节点职责', workflow[index][0]], ['输入 → 输出', workflow[index][1]], ['设计原因', workflow[index][2]], ['Prompt / 规则', workflow[index][3]], ['异常回退', workflow[index][4]]]),
    eval: index => rows([['测试输入', cases[index][1]], ['预期', cases[index][2]], ['实际响应', cases[index][3]], ['验证结果', '合成场景断言通过']])
  };
  Object.entries(panels).forEach(([key, render]) => {
    const options = root.querySelectorAll(`[data-customer-group="${key}"]`);
    const panel = root.querySelector('#customer-' + key);
    panel.innerHTML = render(0);
    options.forEach(button => {
      button.onclick = () => {
        options.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
        panel.innerHTML = render(Number(button.dataset.choice));
      };
    });
  });

  root.querySelectorAll('[data-customer-anchor]').forEach(button => {
    button.onclick = () => root.querySelector('#customer-' + button.dataset.customerAnchor)
      .scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  });
  const chapterObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const chapter = entry.target.id.split('-').at(-1);
      root.querySelectorAll('.cs-nav button').forEach(button => {
        button.setAttribute('aria-current', button.dataset.customerAnchor === chapter ? 'location' : 'false');
      });
    }
  }, { rootMargin: '-20% 0px -60% 0px' });
  root.querySelectorAll('.cs-section').forEach(section => chapterObserver.observe(section));

  let listScroll = 0;
  let caseScroll = 0;
  let lastHash;
  const notify = () => window.dispatchEvent(new PopStateEvent('popstate'));
  const previousOpen = openDetail;
  openDetail = function (section, openerButton) {
    previousOpen(section, openerButton);
    if (section.id !== 'projects') return;
    const card = $('#detail-content').querySelectorAll(':scope > article')[2];
    if (!card || card.querySelector('.customer-entry')) return;
    const entry = document.createElement('button');
    entry.className = 'cs-entry customer-entry';
    entry.textContent = '查看完整项目案例 ↗';
    entry.onclick = () => {
      listScroll = dialog.scrollTop;
      caseScroll = 0;
      history.replaceState({ listScroll }, '', '#projects');
      history.pushState({}, '', route);
      notify();
    };
    card.append(entry);
  };

  function applyRoute() {
    const hash = location.hash;
    if (lastHash === hash) return;
    lastHash = hash;
    const home = $('#home');
    if (hash === route) {
      clearTimeout(leaveTimer);
      intro.hidden = true;
      intro.classList.remove('leaving');
      video.pause();
      home.inert = false;
      if (dialog.open) dialog.close();
      home.style.display = 'none';
      root.hidden = false;
      document.body.style.overflow = '';
      const demo = root.querySelector('iframe');
      if (!demo.hasAttribute('src') && !demo.hasAttribute('srcdoc')) {
        if (assets.demoHtml) {
          demo.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
          demo.srcdoc = assets.demoHtml;
        } else {
          demo.src = demoUrl;
        }
      }
      window.scrollTo(0, caseScroll);
      root.querySelector('h1').focus({ preventScroll: true });
    } else if (!root.hidden) {
      caseScroll = window.scrollY;
      root.hidden = true;
      if (viewer.open) viewer.close();
      if (hash === '#projects' && dialog.open) {
        dialog.scrollTop = history.state?.listScroll ?? listScroll;
        dialog.querySelector('.customer-entry')?.focus({ preventScroll: true });
      }
    }
  }

  root.querySelectorAll('[data-customer-route]').forEach(button => {
    button.onclick = () => {
      history.pushState({ listScroll }, '', button.dataset.customerRoute === 'projects' ? '#projects' : '#home');
      notify();
    };
  });
  addEventListener('popstate', applyRoute);
  addEventListener('hashchange', applyRoute);
  applyRoute();
  if (location.hash === '#projects' && dialog.open) {
    openDetail(config.sections.find(section => section.id === 'projects'), $('.ticket[data-id="projects"]'));
  }
}

function setupPersonalPortrait() {
  const portrait = config.personalPortrait;
  if (!portrait) return;
  const hitbox = document.createElement('div');
  hitbox.className = 'portrait-hitbox';
  hitbox.hidden = true;
  hitbox.innerHTML = `<button type="button" class="portrait-trigger" aria-label="查看本人照片" aria-haspopup="dialog"></button>
    <span class="portrait-hint" aria-hidden="true">查看本人照片 ↗</span>`;
  const trigger = hitbox.querySelector('button');
  // 图片 alt 为空，保留装饰语义；新增按钮需进入键盘与读屏导航。
  stage.removeAttribute('aria-hidden');
  stage.append(hitbox);

  function syncSilhouette() {
    const image = stage.querySelector('img.visible');
    const shape = portrait.shapes[image?.dataset.pose];
    if (!shape || !image.naturalWidth || !image.offsetWidth) {
      hitbox.hidden = true;
      return;
    }
    // 与人物图片的 contain / center bottom 规则使用同一个绘制矩形。
    const fit = Math.min(image.offsetWidth / image.naturalWidth, image.offsetHeight / image.naturalHeight);
    const width = image.naturalWidth * fit;
    const height = image.naturalHeight * fit;
    hitbox.style.left = `${image.offsetLeft + (image.offsetWidth - width) / 2}px`;
    hitbox.style.top = `${image.offsetTop + image.offsetHeight - height}px`;
    hitbox.style.width = `${width}px`;
    hitbox.style.height = `${height}px`;
    trigger.style.clipPath = shape;
    hitbox.hidden = false;
  }
  const resize = new ResizeObserver(syncSilhouette);
  resize.observe(stage);
  stage.querySelectorAll('img').forEach(image => resize.observe(image));
  new MutationObserver(syncSilhouette).observe(stage, { subtree: true, attributes: true, attributeFilter: ['class'] });
  stage.addEventListener('load', syncSilhouette, true);
  syncSilhouette();

  // 沿用证书预览的外观和原生 dialog 行为，独立管理首页焦点。
  const preview = document.createElement('dialog');
  preview.className = 'ar-certificate personal-portrait';
  preview.setAttribute('aria-labelledby', 'personal-portrait-title');
  preview.innerHTML = `<div class="ar-certificate-head"><span id="personal-portrait-title">PORTRAIT / ABOUT ME</span>
    <button type="button" aria-label="关闭本人照片" autofocus>关闭 ×</button></div>
    <div class="ar-certificate-image"><img alt="张嘉铭的本人照片" width="960" height="1282"></div>`;
  document.body.append(preview);
  const photo = preview.querySelector('img');
  const close = preview.querySelector('button');
  let previousOverflow = '';
  let backdropDown = false;
  function outside(event) {
    const rect = preview.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  trigger.onclick = () => {
    if (!intro.hidden || preview.open || dialog.open) return;
    if (!photo.hasAttribute('src')) photo.src = portrait.src;
    previousOverflow = document.body.style.overflow;
    preview.showModal();
    document.body.style.overflow = 'hidden';
    close.focus({ preventScroll: true });
  };
  close.onclick = () => preview.close();
  preview.addEventListener('pointerdown', event => {
    backdropDown = event.target === preview && outside(event);
  });
  preview.addEventListener('click', event => {
    if (backdropDown && event.target === preview && outside(event)) preview.close();
    backdropDown = false;
  });
  preview.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    trigger.focus({ preventScroll: true });
  });
}
