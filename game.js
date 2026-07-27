(function () {
  const STORAGE_KEY = "mirror-circus-save-v1";
  const MUSIC_STORAGE_KEY = "mirror-circus-music-enabled-v1";
  const INTRO_START_TIME = 16;
  const IMAGE_DIR = "assets/images/";
  const GAME_WIDTH = 1920;
  const GAME_HEIGHT = 1080;
  const data = window.GAME_DATA;
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));

  const state = loadState();
  let musicEnabled = localStorage.getItem(MUSIC_STORAGE_KEY) !== "false";
  let outroMusicActive = false;
  const reading = {
    nodeId: null,
    paragraphIndex: 0,
  };

  const el = {
    sceneBg: document.getElementById("sceneBg"),
    sceneItem: document.getElementById("sceneItem"),
    sceneFrameText: document.getElementById("sceneFrameText"),
    framePrevButton: document.getElementById("framePrevButton"),
    frameNextButton: document.getElementById("frameNextButton"),
    sceneScroll: document.getElementById("sceneScroll"),
    sceneScrollImage: document.getElementById("sceneScrollImage"),
    sceneCharacter: document.getElementById("sceneCharacter"),
    startScreen: document.getElementById("startScreen"),
    startButton: document.getElementById("startButton"),
    nodeId: document.getElementById("nodeId"),
    nodeType: document.getElementById("nodeType"),
    endingBadge: document.getElementById("endingBadge"),
    nodeTitle: document.getElementById("nodeTitle"),
    storyPanel: document.getElementById("storyPanel"),
    storyText: document.getElementById("storyText"),
    choices: document.getElementById("choices"),
    progressText: document.getElementById("progressText"),
    musicToggle: document.getElementById("musicToggle"),
    introMusic: document.getElementById("introMusic"),
    outroMusic: document.getElementById("outroMusic"),
    backButton: document.getElementById("backButton"),
    restartButton: document.getElementById("restartButton"),
    mapButton: document.getElementById("mapButton"),
    endingsButton: document.getElementById("endingsButton"),
    drawer: document.getElementById("drawer"),
    drawerTitle: document.getElementById("drawerTitle"),
    drawerBody: document.getElementById("drawerBody"),
    closeDrawer: document.getElementById("closeDrawer"),
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && nodes.has(saved.currentId)) {
        return saved;
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }

    return {
      currentId: data.entryNode,
      history: [],
      visited: [data.entryNode],
      endings: [],
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function visit(id, options = {}) {
    const next = nodes.get(id);
    if (!next) return;
    const current = nodes.get(state.currentId);

    if (current?.isEnding && options.kind === "post_ending") {
      outroMusicActive = true;
    } else if (options.kind === "restart") {
      outroMusicActive = false;
    }

    if (state.currentId !== id) {
      state.history.push(state.currentId);
    }

    state.currentId = id;
    if (!state.visited.includes(id)) {
      state.visited.push(id);
    }
    if (next.isEnding && !state.endings.includes(id)) {
      state.endings.push(id);
    }
    if (options.targetReadState === "choices") {
      reading.nodeId = id;
      reading.paragraphIndex = getChoicesReadIndex(next);
    }

    saveState();
    render();
  }

  function restart() {
    state.currentId = data.entryNode;
    state.history = [];
    state.visited = [data.entryNode];
    outroMusicActive = false;
    saveState();
    render();
  }

  function goBack() {
    const previous = state.history.pop();
    if (!previous) return;
    state.currentId = previous;
    saveState();
    render();
  }

  function render() {
    const node = nodes.get(state.currentId) || nodes.get(data.entryNode);
    const page = Math.max(data.nodes.findIndex((item) => item.id === node.id), 0) + 1;
    const total = data.nodes.length;
    const paragraphs = getReadingUnits(node);

    if (reading.nodeId !== node.id) {
      reading.nodeId = node.id;
      reading.paragraphIndex = 0;
    }
    const choicesReady = isChoicesReady(node, paragraphs);

    el.nodeId.textContent = node.id;
    el.nodeType.textContent = node.type || "story";
    el.endingBadge.hidden = !node.isEnding;
    el.nodeTitle.textContent = node.endingTitle ? `${node.title}：${node.endingTitle}` : node.title;
    el.progressText.textContent = `${page} / ${total}`;
    el.backButton.disabled = state.history.length === 0;

    setImage(el.sceneBg, getSceneBackground(node), node.title);
    const itemReady = isItemReady(node, choicesReady);
    const showItem = isItemVisible(node, itemReady);
    setOptionalImage(el.sceneItem, !node.scrollItem && showItem ? node.item : null, node.title);
    setScrollImage(node.scrollItem && showItem ? node.item : null, node.title);
    const visibleUnit = paragraphs[reading.paragraphIndex] || "";
    setOptionalImage(el.sceneCharacter, getSceneCharacter(node, visibleUnit), node.title);
    setSceneItemChoice(node, itemReady, showItem);

    document.body.dataset.nodeType = node.type || "story";
    document.body.dataset.nodeId = node.id;
    document.body.dataset.ending = node.isEnding ? "true" : "false";
    document.body.dataset.hasItem = node.item ? "true" : "false";
    document.body.dataset.hideStoryPanel = node.hideStoryPanel ? "true" : "false";
    document.body.dataset.textOnItem = node.textOnItem ? "true" : "false";

    if (node.isEnding && !shouldShowEndingCharacter(node)) {
      el.sceneCharacter.hidden = true;
      el.sceneItem.hidden = true;
    }

    syncMusic();

    const visibleParagraph = typeof visibleUnit === "string" ? visibleUnit : visibleUnit.text || "";
    el.storyText.replaceChildren(...(visibleParagraph ? [visibleParagraph] : []).map((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      return p;
    }));
    setFrameText(
      node.textOnItem && typeof visibleUnit === "object"
        ? { ...visibleUnit, singleColumn: Boolean(node.singleColumnText) }
        : node.textOnItem ? visibleUnit : "",
      Boolean(node.textOnItem),
      reading.paragraphIndex > 0,
      reading.paragraphIndex < paragraphs.length - 1
    );
    const canAdvanceText = canAdvanceReading(node, paragraphs);
    el.storyText.classList.toggle("can-advance", canAdvanceText);
    el.storyText.tabIndex = canAdvanceText ? 0 : -1;

    el.storyText.scrollTop = 0;

    const forceTextChoices = shouldRevealTextChoices(node);
    const useItemAsChoice = Boolean(node.useItemAsChoice && !forceTextChoices && node.item && node.choices.length === 1);
    const visibleChoices = choicesReady && !useItemAsChoice ? node.choices : [];
    el.choices.replaceChildren(...visibleChoices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.textContent = choice.label;

      if (choice.target && nodes.has(choice.target)) {
        button.addEventListener("click", () => visit(choice.target, choice));
      } else if (choice.targetUrl) {
        button.addEventListener("click", () => window.open(choice.targetUrl, "_blank", "noopener"));
      } else {
        button.disabled = true;
      }

      return button;
    }));

    el.choices.hidden = !choicesReady || useItemAsChoice;

    if (node.choices.length === 0) {
      const done = document.createElement("p");
      done.className = "ending-item";
      done.textContent = "剧情主体到此结束。";
      el.choices.replaceChildren(done);
    }

    requestAnimationFrame(syncFrameLayout);
  }

  function advanceParagraph(force = false) {
    const node = nodes.get(state.currentId) || nodes.get(data.entryNode);
    const paragraphs = getReadingUnits(node);

    if (
      !force &&
      Number.isInteger(node.itemAdvanceParagraph) &&
      reading.paragraphIndex === node.itemAdvanceParagraph
    ) {
      return;
    }

    if (node.revealChoicesAfterText && reading.paragraphIndex === paragraphs.length - 1) {
      reading.paragraphIndex += 1;
      render();
      return;
    }

    if (reading.paragraphIndex >= paragraphs.length - 1) {
      if (node.finalClickChoice && node.choices.length === 1 && nodes.has(node.choices[0].target)) {
        visit(node.choices[0].target);
      }
      return;
    }

    reading.paragraphIndex += 1;
    render();
  }

  function previousParagraph() {
    if (reading.paragraphIndex <= 0) return;

    reading.paragraphIndex -= 1;
    render();
  }

  function getReadingUnits(node) {
    if (!node.pageByNumber) {
      if (node.textOnItem) {
        return paginatePlainBookUnits(node.body || [], Boolean(node.singleColumnText));
      }

      return node.body || [];
    }

    const units = [];
    let current = null;
    const prefaceLines = [];

    for (const rawLine of node.body || []) {
      const line = String(rawLine).trim();
      if (!line || line === "继续游戏") continue;

      if (units.length === 0 && !current) {
        units.push({
          title: line.replace(/^扉页[:：]\s*/, ""),
          rightOnly: true,
        });
        continue;
      }

      if (/^\d+$/.test(line)) {
        if (prefaceLines.length > 0) {
          units.push({
            title: "",
            lines: [...prefaceLines],
          });
          prefaceLines.length = 0;
        }

        current = {
          title: line,
          lines: [],
        };
        units.push(current);
        continue;
      }

      if (current) {
        current.lines.push(line);
      } else {
        prefaceLines.push(line);
      }
    }

    if (prefaceLines.length > 0) {
      units.push({
        title: "",
        lines: prefaceLines,
      });
    }

    return paginateBookUnits(units);
  }

  function setImage(element, image, alt) {
    if (image === "__black__") {
      element.hidden = true;
      element.removeAttribute("src");
      element.alt = alt;
      return;
    }

    element.src = resolveImagePath(image);
    element.alt = alt;
    element.hidden = false;
  }

  function isItemReady(node, choicesReady) {
    if (
      Number.isInteger(node.revealItemAfterParagraph) &&
      reading.paragraphIndex > node.revealItemAfterParagraph
    ) {
      return true;
    }

    return choicesReady;
  }

  function isItemVisible(node, itemReady) {
    if (
      Number.isInteger(node.hideItemAfterParagraph) &&
      reading.paragraphIndex > node.hideItemAfterParagraph
    ) {
      return false;
    }

    return !node.revealItemAfterText || itemReady;
  }

  function shouldRevealTextChoices(node) {
    return Boolean(
      Number.isInteger(node.revealTextChoicesAfterParagraph) &&
      reading.paragraphIndex > node.revealTextChoicesAfterParagraph
    );
  }

  function isChoicesReady(node, paragraphs) {
    if (node.revealChoicesAfterText) {
      return paragraphs.length === 0 || reading.paragraphIndex >= paragraphs.length;
    }

    return paragraphs.length === 0 || reading.paragraphIndex >= paragraphs.length - 1;
  }

  function canAdvanceReading(node, paragraphs) {
    if (node.revealChoicesAfterText) {
      return reading.paragraphIndex < paragraphs.length;
    }

    return reading.paragraphIndex < paragraphs.length - 1;
  }

  function getChoicesReadIndex(node) {
    const paragraphs = getReadingUnits(node);
    return node.revealChoicesAfterText ? paragraphs.length : Math.max(paragraphs.length - 1, 0);
  }

  function getSceneBackground(node) {
    const paragraphBackground = node.paragraphBackgrounds?.[reading.paragraphIndex];
    if (paragraphBackground) {
      return paragraphBackground;
    }

    if (
      node.backgroundBefore &&
      Number.isInteger(node.backgroundSwitchAt) &&
      reading.paragraphIndex < node.backgroundSwitchAt
    ) {
      return node.backgroundBefore;
    }

    return node.background || "n02-mirror-stage.webp";
  }

  function getSceneCharacter(node, visibleUnit) {
    const rangedCharacter = getRangedCharacter(node, visibleUnit);
    if (rangedCharacter !== undefined) {
      return rangedCharacter;
    }

    if (
      Number.isInteger(node.characterUntilParagraph) &&
      reading.paragraphIndex > node.characterUntilParagraph
    ) {
      return null;
    }

    if (node.characterOnlyWhenSpeaker) {
      const text = typeof visibleUnit === "string" ? visibleUnit : visibleUnit?.text || "";
      return text.startsWith(node.characterOnlyWhenSpeaker) ? node.character : null;
    }

    if (!node.characterBySpeaker) {
      return node.character;
    }

    const text = typeof visibleUnit === "string" ? visibleUnit : visibleUnit?.text || "";
    if (text.startsWith("旁白：（灰豹）") || text.startsWith("灰豹：")) {
      return "grey-leopard.webp";
    }
    if (text.startsWith("黑狮：")) {
      return "black-lion.webp";
    }
    if (text.startsWith("白虎：")) {
      return "white-tiger.png";
    }
    if (text.startsWith("镜象：")) {
      return "mirror-elephant-mask-man.webp";
    }

    return null;
  }

  function getRangedCharacter(node, visibleUnit) {
    if (!Array.isArray(node.characterRanges)) {
      return undefined;
    }

    const text = typeof visibleUnit === "string" ? visibleUnit : visibleUnit?.text || "";
    for (const range of node.characterRanges) {
      const from = Number.isInteger(range.from) ? range.from : 0;
      const to = Number.isInteger(range.to) ? range.to : from;
      if (reading.paragraphIndex < from || reading.paragraphIndex > to) continue;
      if (range.speaker && !text.startsWith(range.speaker)) return null;
      return range.character || null;
    }

    return null;
  }

  function shouldShowEndingCharacter(node) {
    return Boolean(getSceneCharacter(node, getReadingUnits(node)[reading.paragraphIndex]));
  }

  function setOptionalImage(element, image, alt) {
    if (image) {
      setImage(element, image, alt);
      element.dataset.asset = image;
      element.hidden = false;
    } else {
      element.hidden = true;
      delete element.dataset.asset;
      element.removeAttribute("src");
    }
  }

  function setScrollImage(image, alt) {
    if (image) {
      el.sceneScrollImage.src = resolveImagePath(image);
      el.sceneScrollImage.alt = alt;
      el.sceneScroll.hidden = false;
      el.sceneScroll.scrollTop = 0;
    } else {
      el.sceneScroll.hidden = true;
      el.sceneScrollImage.removeAttribute("src");
    }
  }

  function setFrameText(content, enabled, canGoPrevious, canGoNext) {
    if (!enabled) {
      el.sceneFrameText.hidden = true;
      el.sceneFrameText.replaceChildren();
      el.sceneFrameText.tabIndex = -1;
      el.framePrevButton.hidden = true;
      el.frameNextButton.hidden = true;
      return;
    }

    el.sceneFrameText.replaceChildren(renderFrameSpread(content));
    el.sceneFrameText.hidden = false;
    el.sceneFrameText.scrollTop = 0;
    el.sceneFrameText.classList.toggle("can-advance", canGoNext);
    el.sceneFrameText.tabIndex = -1;
    el.framePrevButton.hidden = false;
    el.frameNextButton.hidden = false;
    el.framePrevButton.disabled = !canGoPrevious;
    el.frameNextButton.disabled = !canGoNext;
  }

  function renderFrameSpread(content) {
    const spread = document.createElement("div");
    spread.className = "book-spread";

    if (typeof content === "object" && content?.rightOnly) {
      const left = document.createElement("section");
      left.className = "book-page book-page-left";
      const right = document.createElement("section");
      right.className = "book-page book-page-right";
      const title = document.createElement("h3");
      title.textContent = content.title || "";
      right.append(title);
      spread.append(left, right);
    } else if (typeof content === "object" && content?.singleColumn) {
      spread.classList.add("book-spread-single");
      appendLetterPage(spread, content.lines || []);
    } else if (typeof content === "object") {
      const left = document.createElement("section");
      left.className = "book-page book-page-left";
      const right = document.createElement("section");
      right.className = "book-page book-page-right";
      appendBookPage(left, content.title, content.leftLines || []);
      appendBookPage(right, "", content.rightLines || []);
      spread.append(left, right);
    } else {
      const left = document.createElement("section");
      left.className = "book-page book-page-left";
      const right = document.createElement("section");
      right.className = "book-page book-page-right";
      appendBookPage(left, "", content ? [content] : []);
      spread.append(left, right);
    }

    return spread;
  }

  function appendBookPage(page, title, lines) {
    if (title) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      page.append(heading);
    }

    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      page.append(p);
    }
  }

  function appendLetterPage(container, lines) {
    const page = document.createElement("section");
    page.className = "letter-page";

    for (const line of lines) {
      const p = document.createElement("p");
      p.textContent = line;
      page.append(p);
    }

    container.append(page);
  }

  function paginateBookUnits(units) {
    const pages = [];

    for (const unit of units) {
      if (unit.rightOnly) {
        pages.push(unit);
        continue;
      }

      const wrappedLines = wrapBookLines(unit.lines || []);
      const firstLeftLineCount = unit.title ? 11 : 12;

      for (let index = 0, part = 0; index < wrappedLines.length || part === 0; part += 1) {
        const leftCount = part === 0 ? firstLeftLineCount : 12;
        const leftLines = wrappedLines.slice(index, index + leftCount);
        index += leftCount;
        const rightLines = wrappedLines.slice(index, index + 12);
        index += 12;

        pages.push({
          title: part === 0 ? unit.title : "",
          leftLines,
          rightLines,
        });
      }
    }

    return pages;
  }

  function paginatePlainBookUnits(lines, singleColumn) {
    const cleanLines = lines.filter((line) => String(line).trim() !== "继续游戏");
    const wrappedLines = singleColumn ? wrapLines(cleanLines, 27) : wrapBookLines(cleanLines);
    const pages = [];

    if (singleColumn) {
      for (let index = 0; index < wrappedLines.length || index === 0;) {
        pages.push({
          lines: wrappedLines.slice(index, index + 16),
        });
        index += 16;
      }

      return pages;
    }

    for (let index = 0; index < wrappedLines.length || index === 0;) {
      const leftLines = wrappedLines.slice(index, index + 12);
      index += 12;
      const rightLines = wrappedLines.slice(index, index + 12);
      index += 12;
      pages.push({
        title: "",
        leftLines,
        rightLines,
      });
    }

    return pages;
  }

  function wrapBookLines(lines) {
    return wrapLines(lines, 11);
  }

  function wrapLines(lines, lineLength) {
    const wrapped = [];

    for (const line of lines) {
      const text = String(line);
      for (let index = 0; index < text.length; index += lineLength) {
        wrapped.push(text.slice(index, index + lineLength));
      }
    }

    return wrapped;
  }

  function setSceneItemChoice(node, choicesReady, showItem) {
    const choice = node.choices.length === 1 ? node.choices[0] : null;
    const canAdvanceWithItem = Boolean(
      showItem &&
      Number.isInteger(node.itemAdvanceParagraph) &&
      reading.paragraphIndex === node.itemAdvanceParagraph
    );
    const canUseAsChoice = Boolean(
      showItem &&
      !Number.isInteger(node.itemAdvanceParagraph) &&
      choicesReady &&
      node.item &&
      choice &&
      choice.target &&
      nodes.has(choice.target)
    );

    el.sceneItem.classList.toggle("is-choice", canUseAsChoice || canAdvanceWithItem);
    el.sceneItem.onclick = null;
    el.sceneItem.onkeydown = null;

    if (!canUseAsChoice && !canAdvanceWithItem) {
      el.sceneItem.removeAttribute("role");
      el.sceneItem.removeAttribute("tabindex");
      el.sceneItem.removeAttribute("aria-label");
      return;
    }

    el.sceneItem.role = "button";
    el.sceneItem.tabIndex = 0;
    el.sceneItem.setAttribute("aria-label", canAdvanceWithItem ? "继续" : choice.label);
    el.sceneItem.onclick = canAdvanceWithItem ? () => advanceParagraph(true) : () => visit(choice.target);
    el.sceneItem.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (canAdvanceWithItem) {
          advanceParagraph(true);
        } else {
          visit(choice.target);
        }
      }
    };
  }

  function syncFrameLayout() {
    if (document.body.dataset.textOnItem !== "true" || el.sceneItem.hidden) return;

    const itemWidth = el.sceneItem.offsetWidth;
    const itemHeight = el.sceneItem.offsetHeight;
    const itemTop = el.sceneItem.offsetTop;
    if (itemWidth === 0 || itemHeight === 0) return;

    const scale = itemWidth / 1240;
    const fontSize = clamp(15, 21 * scale, 21);
    const gap = clamp(46, 130 * scale, 130);
    const paddingTop = clamp(24, 54 * scale, 54);
    const paddingBottom = clamp(24, 48 * scale, 48);
    const buttonSize = clamp(34, 44 * scale, 44);

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--book-text-top", `${itemTop + itemHeight * 0.14}px`);
    rootStyle.setProperty("--book-text-width", `${itemWidth * 0.7}px`);
    rootStyle.setProperty("--book-text-height", `${itemHeight * 0.72}px`);
    rootStyle.setProperty("--book-page-button-top", `${itemTop + itemHeight * 0.9}px`);
    rootStyle.setProperty("--book-page-button-offset", `${itemWidth * 0.42}px`);
    rootStyle.setProperty("--book-font-size", `${fontSize}px`);
    rootStyle.setProperty("--book-gap", `${gap}px`);
    rootStyle.setProperty("--book-padding-top", `${paddingTop}px`);
    rootStyle.setProperty("--book-padding-bottom", `${paddingBottom}px`);
    rootStyle.setProperty("--book-page-button-size", `${buttonSize}px`);
    rootStyle.setProperty("--book-page-button-font-size", `${buttonSize * 0.68}px`);
  }

  function clamp(min, value, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isPortraitTouchDevice() {
    return window.matchMedia("(orientation: portrait) and (hover: none) and (pointer: coarse)").matches;
  }

  function syncGameScale() {
    const viewportWidth = isPortraitTouchDevice() ? window.innerHeight : window.innerWidth;
    const viewportHeight = isPortraitTouchDevice() ? window.innerWidth : window.innerHeight;
    const scale = Math.min(viewportWidth / GAME_WIDTH, viewportHeight / GAME_HEIGHT);
    document.documentElement.style.setProperty("--game-scale", `${scale}`);
    requestAnimationFrame(syncFrameLayout);
  }

  function updateMusicButton() {
    el.musicToggle.setAttribute("aria-pressed", String(musicEnabled));
    el.musicToggle.title = musicEnabled ? "关闭音乐" : "开启音乐";
    el.musicToggle.textContent = musicEnabled ? "♪" : "×";
  }

  function playMusic(audio, startTime = 0) {
    if (!audio || !musicEnabled) return;
    if (audio.paused && startTime > 0 && audio.currentTime < startTime) {
      audio.currentTime = startTime;
    }
    audio.volume = 0.58;
    audio.play().catch(() => {
      // Browsers can block autoplay until the first user gesture.
    });
  }

  function stopMusic(audio) {
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function syncMusic() {
    updateMusicButton();

    if (!musicEnabled) {
      el.introMusic.pause();
      el.outroMusic.pause();
      return;
    }

    const startVisible = !el.startScreen.hidden;
    const node = nodes.get(state.currentId) || nodes.get(data.entryNode);

    if (startVisible) {
      outroMusicActive = false;
      stopMusic(el.outroMusic);
      playMusic(el.introMusic, INTRO_START_TIME);
      return;
    }

    if (node.isEnding) {
      outroMusicActive = true;
      stopMusic(el.introMusic);
      playMusic(el.outroMusic);
      return;
    }

    if (outroMusicActive) {
      stopMusic(el.introMusic);
      playMusic(el.outroMusic);
      return;
    }

    stopMusic(el.introMusic);
    stopMusic(el.outroMusic);
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    localStorage.setItem(MUSIC_STORAGE_KEY, String(musicEnabled));
    syncMusic();
  }

  async function requestMobileLandscapeMode() {
    if (!isPortraitTouchDevice()) return;

    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }

      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch (error) {
      // Unsupported browsers keep using the CSS rotated portrait fallback.
    }
  }

  function resolveImagePath(image) {
    if (/^(?:[a-z]+:)?\/\//i.test(image) || image.includes("/")) {
      return image;
    }
    return `${IMAGE_DIR}${image}`;
  }

  function showMap() {
    el.drawer.hidden = false;
    el.drawerTitle.textContent = "分支进度";
    el.drawerBody.replaceChildren();

    const list = document.createElement("div");
    list.className = "node-list";

    for (const node of data.nodes) {
      const item = document.createElement("div");
      item.className = "node-chip";
      if (node.id === state.currentId) item.classList.add("current");
      if (state.visited.includes(node.id)) item.classList.add("visited");

      const title = document.createElement("strong");
      title.textContent = `${node.id} ${node.title}`;
      const meta = document.createElement("p");
      meta.textContent = state.visited.includes(node.id)
        ? `${node.choices.length} 个选择${node.isEnding ? "，已触达结局" : ""}`
        : "尚未探索";
      meta.style.margin = "6px 0 0";

      item.append(title, meta);
      if (state.visited.includes(node.id)) {
        item.tabIndex = 0;
        item.addEventListener("click", () => visit(node.id));
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter") visit(node.id);
        });
      }
      list.append(item);
    }

    el.drawerBody.append(list);
  }

  function showEndings() {
    el.drawer.hidden = false;
    el.drawerTitle.textContent = "结局收集";
    el.drawerBody.replaceChildren();

    const endings = data.nodes.filter((node) => node.isEnding);
    if (state.endings.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "还没有收集到结局。";
      el.drawerBody.append(empty);
      return;
    }

    for (const node of endings) {
      const item = document.createElement("div");
      item.className = "ending-item";
      item.textContent = state.endings.includes(node.id)
        ? `${node.id} ${node.endingTitle || node.title}`
        : "未发现结局";
      el.drawerBody.append(item);
    }
  }

  el.backButton.addEventListener("click", goBack);
  el.restartButton.addEventListener("click", restart);
  el.mapButton.addEventListener("click", showMap);
  el.endingsButton.addEventListener("click", showEndings);
  el.musicToggle.addEventListener("click", toggleMusic);
  el.storyPanel.addEventListener("click", (event) => {
    if (event.target.closest("button, .choice, .controls")) return;
    advanceParagraph();
  });
  el.storyText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advanceParagraph();
    }
  });
  el.framePrevButton.addEventListener("click", previousParagraph);
  el.frameNextButton.addEventListener("click", advanceParagraph);
  el.sceneItem.addEventListener("load", syncFrameLayout);
  el.startButton.addEventListener("click", () => {
    requestMobileLandscapeMode();
    el.startScreen.hidden = true;
    syncMusic();
  });
  document.addEventListener("pointerdown", syncMusic, { once: true });
  document.addEventListener("keydown", syncMusic, { once: true });
  window.addEventListener("resize", syncGameScale);
  el.closeDrawer.addEventListener("click", () => {
    el.drawer.hidden = true;
  });

  syncGameScale();
  syncMusic();
  render();
})();






