/**
 * Camera QR Scanner with BarcodeDetector and jsQR fallback, plus image file reading
 */

let activeStream = null;
let animationFrameId = null;

/**
 * Start camera feed on video element and continuously scan for QR code
 * @param {HTMLVideoElement} videoEl
 * @param {HTMLCanvasElement} canvasEl
 * @param {(decodedText: string) => void} onDetected
 * @param {(err: Error) => void} onError
 */
export async function startCameraScanner(videoEl, canvasEl, onDetected, onError) {
  stopCameraScanner();

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' }, // Back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    activeStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = activeStream;
    await videoEl.play();

    // Check for native BarcodeDetector API
    const hasBarcodeDetector = 'BarcodeDetector' in window;
    let detector = null;
    if (hasBarcodeDetector) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch (e) {
        console.warn('BarcodeDetector format check error:', e);
      }
    }

    const canvasCtx = canvasEl.getContext('2d', { willReadFrequently: true });

    async function scanFrame() {
      if (!activeStream || videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
        animationFrameId = requestAnimationFrame(scanFrame);
        return;
      }

      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      canvasEl.width = vw;
      canvasEl.height = vh;

      // 1. Try native BarcodeDetector first
      if (detector) {
        try {
          const barcodes = await detector.detect(videoEl);
          if (barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            stopCameraScanner();
            onDetected(rawValue);
            return;
          }
        } catch {
          // fallback to canvas frame reading
        }
      }

      // 2. Fallback to jsQR if loaded
      if (window.jsQR) {
        canvasCtx.drawImage(videoEl, 0, 0, vw, vh);
        const imageData = canvasCtx.getImageData(0, 0, vw, vh);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          stopCameraScanner();
          onDetected(code.data);
          return;
        }
      }

      animationFrameId = requestAnimationFrame(scanFrame);
    }

    animationFrameId = requestAnimationFrame(scanFrame);
  } catch (err) {
    let message = 'Could not access camera.';
    if (err.name === 'NotAllowedError') {
      message = 'Camera permission was denied. Please allow camera access in your browser settings.';
    } else if (err.name === 'NotFoundError') {
      message = 'No camera found on this device.';
    }
    onError(new Error(message));
  }
}

/**
 * Stop active camera feed and frame loop
 */
export function stopCameraScanner() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
}

/**
 * Decode QR code from an image file (fallback for devices without camera or photo upload)
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function decodeQrFromImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const img = new Image();
      img.onload = async () => {
        // Try BarcodeDetector
        if ('BarcodeDetector' in window) {
          try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const barcodes = await detector.detect(img);
            if (barcodes.length > 0) {
              return resolve(barcodes[0].rawValue);
            }
          } catch {
            // fallback
          }
        }

        // Try jsQR
        if (window.jsQR) {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, img.width, img.height);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            return resolve(code.data);
          }
        }

        reject(new Error('No QR code could be found in the uploaded image.'));
      };
      img.onerror = () => reject(new Error('Failed to load image file.'));
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

