import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const pdfInput = document.getElementById("pdf-input");
const uploadArea = document.querySelector(".upload-area");

const errorMessage =
  document.getElementById("error-message");

const uploadLabel =
  document.querySelector(".upload-label");

uploadLabel.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    pdfInput.click();
  }
});

const fileInfo = document.getElementById("file-info");
const quality = document.getElementById("quality");

const progress = document.getElementById("progress");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");

const previewContainer =
  document.getElementById("preview-container");

const convertBtn =
  document.getElementById("convert-btn");

const downloadAllBtn =
  document.getElementById("download-all-btn");

const resetBtn =
  document.getElementById("reset-btn");


let selectedFile = null;
let convertedImages = [];



/* FILE SIZE */

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}


/* FILE SELECTION */

pdfInput.addEventListener(
  "change",
  (event) => {
    const file = event.target.files[0];

    if (file) {
      handleFile(file);
    }
  }
);


/* HANDLE FILE */

async function handleFile(file) {
  if (
  file.type !== "application/pdf" &&
  !file.name.toLowerCase().endsWith(".pdf")
) {
  errorMessage.textContent = "Please select a PDF file.";
  errorMessage.hidden = false;
  return;
}

errorMessage.hidden = true;
errorMessage.textContent = "";

  selectedFile = file;
  convertedImages = [];
	convertBtn.textContent = "Convert to JPG";
	convertBtn.disabled = true;

  fileInfo.hidden = false;

  fileInfo.innerHTML = `
    <strong>${escapeHtml(file.name)}</strong>
    <br>
    <span>${formatSize(file.size)}</span>
  `;

  previewContainer.innerHTML = "";

  downloadAllBtn.hidden = true;
  resetBtn.hidden = false;

  convertBtn.disabled = true;

  progress.hidden = false;
  progressFill.style.width = "0%";
  progressText.textContent = "Preparing your PDF...";

  try {

    const buffer =
      await file.arrayBuffer();

    const pdf =
      await pdfjsLib.getDocument({
        data: new Uint8Array(buffer)
      }).promise;

    fileInfo.innerHTML = `
      <strong>${escapeHtml(file.name)}</strong>
      <br>
      <span>
        ${formatSize(file.size)} ·
        ${pdf.numPages}
        ${pdf.numPages === 1 ? "page" : "pages"}
      </span>
    `;

    progress.hidden = true;
    convertBtn.disabled = false;

  } catch (error) {
    console.error(error);

    progressText.textContent =
      "Unable to read this PDF.";

    convertBtn.disabled = true;
  }
}


/* DRAG & DROP */

uploadArea.addEventListener(
  "dragover",
  (event) => {
    event.preventDefault();

    uploadArea.classList.add("dragover");
  }
);


uploadArea.addEventListener(
  "dragleave",
  () => {
    uploadArea.classList.remove("dragover");
  }
);


uploadArea.addEventListener(
  "drop",
  (event) => {
    event.preventDefault();

    uploadArea.classList.remove("dragover");

    const file =
      event.dataTransfer.files[0];

    if (!file) {
      return;
    }

    handleFile(file);
  }
);


/* CONVERT */

convertBtn.addEventListener(
  "click",
  convertPDF
);


async function convertPDF() {
  if (!selectedFile) {
    return;
  }

  convertBtn.disabled = true;

  downloadAllBtn.hidden = true;

  previewContainer.innerHTML = "";

  convertedImages = [];

  progress.hidden = false;

  progressFill.style.width = "0%";

  try {
    const buffer =
      await selectedFile.arrayBuffer();

    const pdf =
      await pdfjsLib.getDocument({
        data: new Uint8Array(buffer)
      }).promise;

    const scale =
      Number(quality.value);

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      progressText.textContent =
        `Converting page ${pageNumber} of ${pdf.numPages}...`;

      const page =
        await pdf.getPage(pageNumber);

      const viewport =
        page.getViewport({
          scale
        });

      const canvas =
        document.createElement("canvas");

      const context =
        canvas.getContext("2d", {
          alpha: false
        });

      canvas.width =
        Math.ceil(viewport.width);

      canvas.height =
        Math.ceil(viewport.height);

      context.fillStyle = "#ffffff";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      const blob =
        await new Promise((resolve) => {
          canvas.toBlob(
            resolve,
            "image/jpeg",
            0.92
          );
        });

      if (!blob) {
        throw new Error(
          "Unable to create JPG image."
        );
      }

      const url =
        URL.createObjectURL(blob);

      convertedImages.push({
        page: pageNumber,
        blob,
        url
      });

      createPreview(
        pageNumber,
        blob,
        url
      );

      const percent =
        Math.round(
          (pageNumber / pdf.numPages) * 100
        );

      progressFill.style.width =
        `${percent}%`;
    }

    progressText.textContent =
      "Conversion complete.";

    downloadAllBtn.hidden = false;

	convertBtn.textContent =
  "Converted ✓";

convertBtn.disabled = true;

  } catch (error) {
    console.error(error);

    progressText.textContent =
      "Something went wrong while converting the PDF.";

  } finally {
    convertBtn.disabled = false;
  }
}


/* CREATE PREVIEW */

function createPreview(
  pageNumber,
  blob,
  url
) {
  const card =
    document.createElement("div");

  card.className =
    "preview-card";

  const image =
    document.createElement("img");

  image.src = url;

  image.alt =
    `Converted page ${pageNumber}`;

  const title =
    document.createElement("p");

  title.textContent =
    `Page ${pageNumber} · ${formatSize(blob.size)}`;

  const download =
    document.createElement("a");

  download.href = url;

  download.download =
    selectedFile.name
      .replace(/\.pdf$/i, "")
    + `-page-${pageNumber}.jpg`;

  download.textContent =
    "Download JPG";

  download.style.display =
    "inline-block";

  download.style.marginTop =
    "10px";

  download.style.fontSize =
    "12px";

  download.style.fontWeight =
    "600";

  download.style.textDecoration =
    "underline";

  card.appendChild(image);

  card.appendChild(title);

  card.appendChild(download);

  previewContainer.appendChild(card);
}


/* DOWNLOAD ALL */

downloadAllBtn.addEventListener(
  "click",
  downloadAll
);


async function downloadAll() {
  if (!convertedImages.length) {
    return;
  }

  downloadAllBtn.disabled = true;

  downloadAllBtn.textContent =
    "Creating ZIP...";

  try {
    

    const zip =
      new JSZip();

    const baseName =
      selectedFile.name
        .replace(/\.pdf$/i, "");

    convertedImages.forEach(
      (image) => {
        zip.file(
          `${baseName}-page-${image.page}.jpg`,
          image.blob
        );
      }
    );

    const zipBlob =
      await zip.generateAsync({
        type: "blob"
      });

    const url =
      URL.createObjectURL(zipBlob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download =
      `${baseName}-JPGs.zip`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);

  } catch (error) {
    console.error(error);

    alert(
      "Unable to create the ZIP file."
    );

  } finally {
    downloadAllBtn.disabled = false;

    downloadAllBtn.textContent =
      "Download All ZIP";
  }
}


/* RESET */

resetBtn.addEventListener(
  "click",
  resetTool
);


function resetTool() {

	errorMessage.hidden = true;
  errorMessage.textContent = "";

	convertBtn.textContent = "Convert to JPG";
  convertBtn.disabled = true;

  convertedImages.forEach(
    (image) => {
      URL.revokeObjectURL(image.url);
    }
  );

  selectedFile = null;

  convertedImages = [];

  pdfInput.value = "";

  fileInfo.hidden = true;

  previewContainer.innerHTML = "";

  progress.hidden = true;

  progressFill.style.width =
    "0%";

  progressText.textContent =
    "Preparing...";

  convertBtn.disabled = true;

  downloadAllBtn.hidden = true;

  resetBtn.hidden = true;
}


/* HTML SAFETY */

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}