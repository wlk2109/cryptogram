# Cryptogram Solver

A static, browser-based substitution cryptogram helper. Paste an encoded message
or import it from a photo, then assign letters and inspect letter frequencies.

## Run

Serve this directory with any static server, for example:

```sh
python -m http.server 8000
```

Open http://localhost:8000. There is no build step or backend.

## Import a photo

1. Choose a PNG, JPG, WebP, BMP, or GIF image (up to 20 MB).
2. Check the preview and select **Extract text**. Successful recognition replaces
   the encoded message and clears existing guesses, updating the puzzle and stats.
3. Correct any recognition mistakes in the message before solving. OCR reads all
   visible text; remove headings, clues, or attribution if they are not part of the
   cryptogram. For best results, crop closely to upright, clearly printed letters.

Recognition uses [Tesseract.js 7.0.0](https://github.com/naptha/tesseract.js),
an open-source OCR library licensed under Apache-2.0. It runs locally in a web
worker: photos are not sent to an OCR server, and no API key or payment is needed.
Internet access is required to fetch the library, WebAssembly engine, and English
language data from their CDNs. The library loads only on demand, so manual input
still works if downloads fail. This is not a fully offline OCR installation.

Dictionary correction is disabled for ciphertext. OCR output is uppercased while
preserving punctuation and line breaks; ambiguous letters and digits are left for
manual review. Large photos are scaled to a maximum dimension of 3,000 pixels.
HEIC files must be converted to JPG or PNG first. Cancellation, unreadable images,
empty results, and download failures preserve the current message and guesses.
