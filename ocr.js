// Tesseract is loaded only when requested, so manual solving works offline.
(() => {
  const photoInput = document.getElementById("photoInput");
  const preview = document.getElementById("photoPreview");
  const extractButton = document.getElementById("extractButton");
  const cancelButton = document.getElementById("cancelOcrButton");
  const progress = document.getElementById("ocrProgress");
  const status = document.getElementById("ocrStatus");
  const messageInput = document.getElementById("inputText");
  const resetButton = document.getElementById("resetButton");
  const upload = document.getElementById("photoUpload");
  const cdn = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist";
  let libraryPromise;
  let selectedFile = null;
  let previewUrl;
  let activeJob = null;

  function showStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function setBusy(busy) {
    upload.setAttribute("aria-busy", String(busy));
    photoInput.disabled = busy;
    extractButton.disabled = busy || !selectedFile;
    cancelButton.hidden = !busy;
    progress.hidden = !busy;
    messageInput.readOnly = busy;
    resetButton.disabled = busy;
  }

  function loadLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(fail, 30000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Could not download OCR. Check your internet connection and try again."));
      }
      script.src = `${cdn}/tesseract.min.js`;
      script.onload = () => {
        clearTimeout(timer);
        if (window.Tesseract) resolve(window.Tesseract);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch(error => {
      libraryPromise = null;
      throw error;
    });
    return libraryPromise;
  }

  photoInput.addEventListener("change", async () => {
    selectedFile = null;
    extractButton.disabled = true;
    preview.hidden = true;
    preview.removeAttribute("src");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    showStatus("");
    const file = photoInput.files[0];
    if (!file) return;
    const supported = /^image\/(png|jpeg|webp|bmp|gif)$/i.test(file.type) ||
      (!file.type && /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name));
    if (!supported) {
      showStatus("Choose a PNG, JPG, WebP, BMP, or GIF image. Convert HEIC photos to JPG first.", true);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showStatus("This photo is larger than 20 MB. Crop or resize it and try again.", true);
      return;
    }
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    try {
      await preview.decode();
      if (photoInput.files[0] !== file) return;
      selectedFile = file;
      preview.hidden = false;
      extractButton.disabled = false;
      showStatus("Photo ready. Select Extract text to fill the encoded message.");
    } catch {
      if (photoInput.files[0] === file) {
        showStatus("This image could not be opened. Try another photo or export it as JPG or PNG.", true);
      }
    }
  });

  extractButton.addEventListener("click", async () => {
    if (!selectedFile || activeJob) return;
    const job = { worker: null, stop: null };
    activeJob = job;
    setBusy(true);
    progress.removeAttribute("value");
    showStatus("Loading OCR… The first download may take a moment.");

    // A separate rejection path also handles worker failures that leave an OCR
    // promise pending, cancellation, and a stalled network/recognition timeout.
    const stopped = new Promise((_, reject) => { job.stop = reject; });
    const timeout = setTimeout(() => job.stop(new Error(
      "OCR took too long. Check your connection or try a smaller, clearer photo."
    )), 120000);

    const recognize = async () => {
      const Tesseract = await loadLibrary();
      if (activeJob !== job) return;
      const worker = await Tesseract.createWorker("eng", 1, {
        workerPath: `${cdn}/worker.min.js`,
        corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
        logger: event => {
          if (activeJob !== job) return;
          if (event.status === "recognizing text") {
            progress.value = event.progress;
            showStatus(`Reading photo… ${Math.round(event.progress * 100)}%`);
          }
        },
        errorHandler: () => job.stop(new Error(
          "OCR could not read the photo. Check your connection and try a clear JPG or PNG."
        ))
      }, {
        // Ciphertext is not English: avoid dictionary-based word corrections.
        load_system_dawg: "0",
        load_freq_dawg: "0",
        load_number_dawg: "0",
        load_punc_dawg: "0",
        load_unambig_dawg: "0",
        load_bigram_dawg: "0"
      });
      if (activeJob !== job) {
        await worker.terminate();
        return;
      }
      job.worker = worker;

      // Bound the recognition workload for large phone photos, and composite
      // transparent images onto white without changing their letter shapes.
      const scale = Math.min(1, 3000 / Math.max(preview.naturalWidth, preview.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(preview.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(preview.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(preview, 0, 0, canvas.width, canvas.height);
      const result = await worker.recognize(canvas);
      return result.data.text.replace(/\r\n?/g, "\n").trim().toUpperCase();
    };

    let succeeded = false;
    try {
      const text = await Promise.race([recognize(), stopped]);
      if (activeJob !== job) return;
      if (!text || !/[A-Z]/.test(text)) {
        throw new Error("No letters found. Try a sharper photo cropped closely to the cryptogram.");
      }
      messageInput.value = text;
      messageInput.dispatchEvent(new Event("input", { bubbles: true }));
      showStatus("Text extracted. Review the encoded message for mistakes and remove any headings or extra text.");
      succeeded = true;
    } catch (error) {
      showStatus(error.message || "Could not read this photo. Please try another image.", error.name !== "AbortError");
    } finally {
      clearTimeout(timeout);
      activeJob = null;
      if (job.worker) job.worker.terminate().catch(() => {});
      setBusy(false);
      if (succeeded) messageInput.focus();
    }
  });

  cancelButton.addEventListener("click", () => {
    activeJob?.stop(new DOMException("OCR cancelled. Your encoded message was kept.", "AbortError"));
  });
})();
