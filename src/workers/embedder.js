importScripts(
  'https://cdn.jsdelivr.net/npm/comlink@4.4.1/dist/umd/comlink.min.js',
);

/**
 * @typedef {Object} Expose
 * @property {function(string): Promise<{ floatEmbedding: number[] }>} createEmbedding
 */

let imageEmbedderPromise;

async function getEmbedders() {
  // Ugly hack to avoid Next.js from breaking the import
  const { FilesetResolver, ImageEmbedder } = await eval(`
    import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'
    )
  `);

  const vision = await FilesetResolver.forVisionTasks(
    // path/to/wasm/root
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  );

  const imageEmbedder = await ImageEmbedder.createFromOptions(vision, {
    baseOptions: {
      // modelAssetPath: `https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite`,
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_large/float32/latest/mobilenet_v3_large.tflite`,
    },
  });

  return { imageEmbedder };
}

/** @type {Expose} */
const object = {
  async createEmbedding(imageSrc) {
    // Load the image as a blob
    const response = await fetch(imageSrc);
    const blob = await response.blob();

    // Create an OffscreenCanvas and draw the image
    const imgBitmap = await createImageBitmap(blob);

    const imageEmbedder = await (async () => {
      if (imageEmbedderPromise == null) {
        imageEmbedderPromise = getEmbedders();
      }

      return (await imageEmbedderPromise).imageEmbedder;
    })();

    const imageEmbedderResult = imageEmbedder.embed(imgBitmap);

    return {
      floatEmbedding: imageEmbedderResult.embeddings.at(0).floatEmbedding,
    };
  },
};

Comlink.expose(object);
