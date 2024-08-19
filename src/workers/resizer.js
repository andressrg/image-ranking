importScripts(
  'https://cdn.jsdelivr.net/npm/comlink@4.4.1/dist/umd/comlink.min.js',
);

/**
 * @typedef {Object} Expose
 * @property {function(string): string} hello
 * @property {function(string, number): Promise<string>} createThumbnail
 */

/** @type {Expose} */
const object = {
  hello(name) {
    return `Hello, ${name}!`;
  },

  async createThumbnail(imageSrc, maxSideLength) {
    // Load the image as a blob
    const response = await fetch(imageSrc);
    const blob = await response.blob();

    // Create an OffscreenCanvas and draw the image
    const imgBitmap = await createImageBitmap(blob);

    const aspectRatio = imgBitmap.width / imgBitmap.height;
    let newWidth, newHeight;

    if (imgBitmap.width > imgBitmap.height) {
      newWidth = maxSideLength;
      newHeight = maxSideLength / aspectRatio;
    } else {
      newHeight = maxSideLength;
      newWidth = maxSideLength * aspectRatio;
    }

    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(imgBitmap, 0, 0, newWidth, newHeight);

    const resultBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.8,
    });

    const result = await new Promise((res) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.readAsDataURL(resultBlob);
    });

    // Clean up the object URL
    URL.revokeObjectURL(imageSrc);

    return result;
  },
};

Comlink.expose(object);
