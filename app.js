// ==================== 合併功能（原本，未修改）====================

const input = document.querySelector('#pdfInput');
const dropZone = document.querySelector('#dropZone');
const fileList = document.querySelector('#fileList');
const mergeBtn = document.querySelector('#mergeBtn');
const clearBtn = document.querySelector('#clearBtn');
const statusText = document.querySelector('#status');

/** @typedef {{ file: File, pageCount: number | null, error: string | null }} FileEntry */
/** @type {FileEntry[]} */
const files = [];

input.addEventListener('change', async (event) => {
  const selectedFiles = Array.from(event.target.files || []);
  await addFiles(selectedFiles);
  input.value = '';
});

dropZone.addEventListener('click', () => input.click());
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    input.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', async (event) => {
  const droppedFiles = Array.from(event.dataTransfer?.files || []);
  await addFiles(droppedFiles);
});

mergeBtn.addEventListener('click', async () => {
  if (files.length < 2) {
    setStatus('請至少加入 2 份 PDF 再合併。', true);
    return;
  }

  const invalidFiles = files.filter((entry) => entry.error);
  if (invalidFiles.length) {
    setStatus('清單中有無法讀取的 PDF，請先刪除錯誤檔案。', true);
    return;
  }

  try {
    mergeBtn.disabled = true;
    setStatus('合併中，請稍候...');

    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const entry of files) {
      const bytes = await entry.file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `merged-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();

    URL.revokeObjectURL(url);
    setStatus('合併完成，已開始下載。');
  } catch (error) {
    console.error(error);
    setStatus(`合併失敗：${toErrorMessage(error)}`, true);
  } finally {
    mergeBtn.disabled = files.length < 2;
  }
});

clearBtn.addEventListener('click', () => {
  files.length = 0;
  renderList();
  setStatus('已清空清單。');
});

async function addFiles(rawFiles) {
  const selectedFiles = rawFiles.filter((file) => file.type === 'application/pdf');
  const skippedCount = rawFiles.length - selectedFiles.length;

  if (!selectedFiles.length) {
    setStatus('請選擇 PDF 檔案。', true);
    return;
  }

  const deduped = selectedFiles.filter((candidate) => {
    return !files.some(
      (entry) =>
        entry.file.name === candidate.name &&
        entry.file.size === candidate.size &&
        entry.file.lastModified === candidate.lastModified
    );
  });

  if (!deduped.length) {
    setStatus('這批檔案都已經在清單中。', true);
    return;
  }

  const newEntries = deduped.map((file) => ({ file, pageCount: null, error: null }));
  files.push(...newEntries);
  renderList();

  let message = `已加入 ${deduped.length} 份 PDF，正在讀取頁數...`;
  if (skippedCount > 0) {
    message += `（略過 ${skippedCount} 個非 PDF 檔）`;
  }
  setStatus(message);

  await Promise.all(newEntries.map(updatePageCount));
  renderList();

  const failed = newEntries.filter((entry) => entry.error).length;
  if (failed > 0) {
    setStatus(`加入完成，但有 ${failed} 份檔案讀取失敗。`, true);
    return;
  }

  setStatus(`已加入 ${deduped.length} 份 PDF。`);
}

async function updatePageCount(entry) {
  try {
    const { PDFDocument } = PDFLib;
    const bytes = await entry.file.arrayBuffer();
    const pdf = await PDFDocument.load(bytes);
    entry.pageCount = pdf.getPageCount();
    entry.error = null;
  } catch (error) {
    console.error(error);
    entry.pageCount = null;
    entry.error = toErrorMessage(error);
  }
}

function renderList() {
  fileList.innerHTML = '';

  files.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'file-item';

    const metaWrap = document.createElement('div');
    metaWrap.className = 'file-meta';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = `${index + 1}. ${entry.file.name}`;

    const detail = document.createElement('span');
    detail.className = 'file-detail';

    if (entry.error) {
      detail.classList.add('file-error');
      detail.textContent = `錯誤：${entry.error}`;
    } else {
      detail.textContent =
        entry.pageCount === null
          ? '頁數：讀取中...'
          : `頁數：${entry.pageCount} 頁｜大小：${formatSize(entry.file.size)}`;
    }

    metaWrap.append(name, detail);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const up = createActionButton('↑', () => moveFile(index, -1));
    const down = createActionButton('↓', () => moveFile(index, 1));
    const remove = createActionButton('刪除', () => removeFile(index), 'remove');

    up.disabled = index === 0;
    down.disabled = index === files.length - 1;

    actions.append(up, down, remove);
    item.append(metaWrap, actions);
    fileList.append(item);
  });

  mergeBtn.disabled = files.length < 2;
  clearBtn.disabled = files.length === 0;
}

function createActionButton(text, onClick, extraClass = '') {
  const button = document.createElement('button');
  button.textContent = text;
  if (extraClass) button.classList.add(extraClass);
  button.addEventListener('click', onClick);
  return button;
}

function moveFile(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= files.length) return;
  [files[index], files[targetIndex]] = [files[targetIndex], files[index]];
  renderList();
}

function removeFile(index) {
  files.splice(index, 1);
  renderList();
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function toErrorMessage(error) {
  if (error instanceof Error) return error.message || '未知錯誤';
  return '未知錯誤';
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#dc2626' : '#0369a1';
}

// ==================== 分割功能（含拖曳 + 縮圖預覽）====================

const splitInput      = document.getElementById('splitInput');
const splitDropZone   = document.getElementById('splitDropZone');
const splitFileInfo   = document.getElementById('splitFileInfo');
const splitPreviewCard = document.getElementById('splitPreviewCard');
const splitThumbnails = document.getElementById('splitThumbnails');
const splitBtn        = document.getElementById('splitBtn');
const splitStatus     = document.getElementById('splitStatus');
const selectedCount   = document.getElementById('selectedCount');
const selectAllBtn    = document.getElementById('selectAllBtn');
const deselectAllBtn  = document.getElementById('deselectAllBtn');

let splitFileBuffer = null;
let splitTotalPages = 0;
// selectedPages: Set of 0-based page indices
const selectedPages = new Set();

// ── 拖曳區域 ──
splitDropZone.addEventListener('click', () => splitInput.click());
splitDropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); splitInput.click(); }
});

['dragenter', 'dragover'].forEach((ev) => {
  splitDropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    splitDropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  splitDropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    splitDropZone.classList.remove('drag-over');
  });
});
splitDropZone.addEventListener('drop', async (e) => {
  const droppedFiles = Array.from(e.dataTransfer?.files || []);
  const pdf = droppedFiles.find((f) => f.type === 'application/pdf');
  if (!pdf) { setSplitStatus('請拖曳 PDF 檔案。', true); return; }
  await loadSplitFile(pdf);
});

splitInput.addEventListener('change', async () => {
  const file = splitInput.files[0];
  if (file) await loadSplitFile(file);
  splitInput.value = '';
});

// ── 載入檔案並渲染縮圖 ──
async function loadSplitFile(file) {
  splitFileInfo.textContent = '讀取中…';
  splitPreviewCard.style.display = 'none';
  splitThumbnails.innerHTML = '';
  selectedPages.clear();
  splitFileBuffer = null;

  try {
    splitFileBuffer = await file.arrayBuffer();

    // 用 pdf-lib 取得總頁數
    const pdfDoc = await PDFLib.PDFDocument.load(splitFileBuffer);
    splitTotalPages = pdfDoc.getPageCount();
    splitFileInfo.textContent = `✅ ${file.name}（共 ${splitTotalPages} 頁）`;
    splitPreviewCard.style.display = '';

    // 用 PDF.js 渲染縮圖
    await renderThumbnails(splitFileBuffer, splitTotalPages);
    updateSelectedCount();
  } catch (e) {
    splitFileInfo.textContent = '❌ 無法讀取此 PDF，請確認檔案是否損毀。';
    console.error(e);
  }
}

// ── 渲染所有頁面縮圖 ──
async function renderThumbnails(buffer, totalPages) {
  splitThumbnails.innerHTML = '<p class="thumb-loading">縮圖產生中，請稍候…</p>';

  const uint8 = new Uint8Array(buffer);
  const pdfJs = await pdfjsLib.getDocument({ data: uint8 }).promise;

  splitThumbnails.innerHTML = '';

  for (let i = 1; i <= totalPages; i++) {
    const pageIndex = i - 1; // 0-based

    // 外框
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-wrapper';
    wrapper.dataset.page = pageIndex;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';

    // 頁碼標籤
    const label = document.createElement('span');
    label.className = 'thumb-label';
    label.textContent = `第 ${i} 頁`;

    // 勾選 overlay
    const check = document.createElement('div');
    check.className = 'thumb-check';
    check.textContent = '✓';

    wrapper.append(canvas, label, check);
    splitThumbnails.append(wrapper);

    // 點擊切換選取
    wrapper.addEventListener('click', () => {
      if (selectedPages.has(pageIndex)) {
        selectedPages.delete(pageIndex);
        wrapper.classList.remove('selected');
      } else {
        selectedPages.add(pageIndex);
        wrapper.classList.add('selected');
      }
      updateSelectedCount();
    });

    // 非同步渲染這一頁
    renderOnePage(pdfJs, i, canvas);
  }
}

async function renderOnePage(pdfJs, pageNum, canvas) {
  try {
    const page = await pdfJs.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.3 });
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  } catch (e) {
    console.error(`第 ${pageNum} 頁縮圖渲染失敗`, e);
  }
}

// ── 全選 / 全部取消 ──
selectAllBtn.addEventListener('click', () => {
  for (let i = 0; i < splitTotalPages; i++) selectedPages.add(i);
  document.querySelectorAll('.thumb-wrapper').forEach((w) => w.classList.add('selected'));
  updateSelectedCount();
});

deselectAllBtn.addEventListener('click', () => {
  selectedPages.clear();
  document.querySelectorAll('.thumb-wrapper').forEach((w) => w.classList.remove('selected'));
  updateSelectedCount();
});

function updateSelectedCount() {
  const n = selectedPages.size;
  selectedCount.textContent = `已選 ${n} 頁`;
  splitBtn.disabled = n === 0;
}

// ── 下載選取頁面 ──
splitBtn.addEventListener('click', async () => {
  if (!splitFileBuffer || selectedPages.size === 0) return;

  splitBtn.disabled = true;
  setSplitStatus(`處理中，共 ${selectedPages.size} 頁…`);

  try {
    const srcDoc = await PDFLib.PDFDocument.load(splitFileBuffer);
    const newDoc = await PDFLib.PDFDocument.create();

    // 依頁碼順序排列
    const sortedPages = [...selectedPages].sort((a, b) => a - b);
    const copied = await newDoc.copyPages(srcDoc, sortedPages);
    copied.forEach((page) => newDoc.addPage(page));

    const pdfBytes = await newDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `split-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    setSplitStatus(`✅ 已下載，共 ${selectedPages.size} 頁。`);
  } catch (e) {
    setSplitStatus(`❌ 下載失敗：${e.message}`, true);
  } finally {
    splitBtn.disabled = selectedPages.size === 0;
  }
});

function setSplitStatus(message, isError = false) {
  splitStatus.textContent = message;
  splitStatus.style.color = isError ? '#dc2626' : '#0369a1';
}
