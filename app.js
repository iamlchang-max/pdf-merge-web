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
  if (error instanceof Error) {
    return error.message || '未知錯誤';
  }
  return '未知錯誤';
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#dc2626' : '#0369a1';
}

// ==================== 分割功能（新增）====================

const splitInput     = document.getElementById('splitInput');
const splitFileInfo  = document.getElementById('splitFileInfo');
const splitRangeCard = document.getElementById('splitRangeCard');
const splitRangeInput = document.getElementById('splitRangeInput');
const splitBtn       = document.getElementById('splitBtn');
const splitStatus    = document.getElementById('splitStatus');

let splitFileBuffer = null;  // 待分割 PDF 的 ArrayBuffer
let splitTotalPages = 0;

// 1. 選擇檔案：讀取並顯示總頁數
splitInput.addEventListener('change', async () => {
  const file = splitInput.files[0];
  if (!file) return;

  splitStatus.textContent = '';
  splitFileInfo.textContent = '讀取中…';
  splitRangeCard.style.display = 'none';
  splitFileBuffer = null;

  try {
    splitFileBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(splitFileBuffer);
    splitTotalPages = pdfDoc.getPageCount();
    splitFileInfo.textContent = `✅ ${file.name}（共 ${splitTotalPages} 頁）`;
    splitRangeCard.style.display = '';
  } catch (e) {
    splitFileInfo.textContent = '❌ 無法讀取此 PDF，請確認檔案是否損毀。';
  }
});

// 2. 解析範圍字串，例如 "1-3, 5, 7-10"
//    回傳 { result: [{ label, pages: [0-based index, ...] }, ...], errors: [...] }
function parseRanges(rangeStr, totalPages) {
  const segments = rangeStr.split(',').map((s) => s.trim()).filter(Boolean);
  const result = [];
  const errors = [];

  for (const seg of segments) {
    const matchRange  = seg.match(/^(\d+)-(\d+)$/);
    const matchSingle = seg.match(/^(\d+)$/);

    if (matchRange) {
      const from = parseInt(matchRange[1], 10);
      const to   = parseInt(matchRange[2], 10);
      if (from < 1 || to > totalPages || from > to) {
        errors.push(`「${seg}」超出範圍（共 ${totalPages} 頁）`);
        continue;
      }
      const pages = [];
      for (let i = from; i <= to; i++) pages.push(i - 1); // 轉 0-based
      result.push({ label: seg, pages });
    } else if (matchSingle) {
      const page = parseInt(matchSingle[1], 10);
      if (page < 1 || page > totalPages) {
        errors.push(`「${seg}」超出範圍（共 ${totalPages} 頁）`);
        continue;
      }
      result.push({ label: seg, pages: [page - 1] });
    } else {
      errors.push(`「${seg}」格式無法辨識`);
    }
  }

  return { result, errors };
}

// 3. 執行分割並打包 ZIP 下載
splitBtn.addEventListener('click', async () => {
  if (!splitFileBuffer) return;

  const rangeStr = splitRangeInput.value.trim();
  if (!rangeStr) {
    setSplitStatus('⚠️ 請輸入分割範圍。', true);
    return;
  }

  const { result: ranges, errors } = parseRanges(rangeStr, splitTotalPages);

  if (errors.length > 0) {
    setSplitStatus('❌ ' + errors.join('；'), true);
    return;
  }
  if (ranges.length === 0) {
    setSplitStatus('⚠️ 沒有有效範圍，請重新輸入。', true);
    return;
  }

  splitBtn.disabled = true;
  setSplitStatus(`處理中，共 ${ranges.length} 個片段…`);

  try {
    const srcDoc = await PDFLib.PDFDocument.load(splitFileBuffer);
    const zip = new JSZip();

    for (let i = 0; i < ranges.length; i++) {
      const { label, pages } = ranges[i];
      const newDoc = await PDFLib.PDFDocument.create();
      const copied = await newDoc.copyPages(srcDoc, pages);
      copied.forEach((page) => newDoc.addPage(page));
      const pdfBytes = await newDoc.save();
      const filename = `split_${String(i + 1).padStart(2, '0')}_p${label}.pdf`;
      zip.file(filename, pdfBytes);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `split-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setSplitStatus(`✅ 已下載 ${ranges.length} 個 PDF（ZIP）。`);
  } catch (e) {
    setSplitStatus(`❌ 分割失敗：${e.message}`, true);
  } finally {
    splitBtn.disabled = false;
  }
});

function setSplitStatus(message, isError = false) {
  splitStatus.textContent = message;
  splitStatus.style.color = isError ? '#dc2626' : '#0369a1';
}
