# Image Ranking App

<img width="894" alt="Screenshot 2024-08-19 at 3 36 45 PM" src="https://github.com/user-attachments/assets/33770fc0-6038-400e-be97-a543f0360229">


This is a browser-based app that allows users to rank images according to their preferences. It works entirely locally in the browser.

## Features

- **Local Processing**: All image processing and ranking happen directly in your browser, with no data sent to external servers.
- **Image Embeddings**: Uses [Google MediaPipe](https://github.com/google-ai-edge/mediapipe) to generate image embeddings.
- **Ranking Algorithms**: Supports both Cosine distance and Random Forests. Sometimes one works better than the other, depending on the number of preference selections (👍 or 👎).
- **Thumbnails**: Generates thumbnails for each image, allowing smooth handling and display of hundreds of images simultaneously.
- **Multi-Threaded Processing**: Offloads heavy image processing tasks to separate threads using [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), to improve UI responsiveness. Uses [Comlink](https://github.com/GoogleChromeLabs/comlink) to facilitate communication with the Web Workers.
- **File System Access**: Easily browse and load images from folders and subfolders on your computer using the [File System Access API](https://web.dev/file-system-access/).
