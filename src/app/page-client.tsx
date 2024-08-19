'use client';

import * as React from 'react';
import NextImage from 'next/image';
import { enableMapSet, produce } from 'immer';
import { compact, sortBy } from 'lodash';
import { InView } from 'react-intersection-observer';
import * as Comlink from 'comlink';
import pMap from 'p-map';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';

import { cn } from '@/lib/utils';
import { Debounce } from '@/components/useDebounce';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

enableMapSet();

const SUPPORTED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i]! * vecB[i]!;
    normA += vecA[i]! * vecA[i]!;
    normB += vecB[i]! * vecB[i]!;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const EMBEDDERS_COUNT = 3;

function useEmbeddings(args: { images: File[] }) {
  const { images } = args;

  const [imagesWithEmbeddings, setImagesWithEmbeddings] = React.useState<
    Map<File, { floatEmbedding: number[] }>
  >(() => new Map());

  const [finished, setFinished] = React.useState(0);

  const { data: imageEmbedders } = useSWRImmutable('imageEmbedder', async () =>
    Promise.all(
      Array.from(Array(EMBEDDERS_COUNT)).map(() =>
        Comlink.wrap<import('../workers/embedder').Expose>(
          new Worker(new URL('../workers/embedder', import.meta.url)),
        ),
      ),
    ),
  );

  React.useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      setFinished(0);

      if (abortController.signal.aborted) return;

      const results = await pMap(
        images,
        async (file) => {
          if (abortController.signal.aborted) return;

          const imageEmbedder = oneOf(imageEmbedders ?? []);

          if (imageEmbedder == null) return;

          const url = URL.createObjectURL(file);

          try {
            const embedding = await imageEmbedder.createEmbedding(url);

            if (abortController.signal.aborted) return;

            setFinished((prev) => prev + 1);

            return {
              file,
              embedding,
            };
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { concurrency: 10 },
      );

      if (abortController.signal.aborted) return;

      setImagesWithEmbeddings(
        new Map(compact(results).map((r) => [r.file, r.embedding])),
      );
    })();

    return () => abortController.abort();
  }, [imageEmbedders, images]);

  return {
    imagesWithEmbeddings,
    progress: images.length === 0 ? undefined : finished / images.length,
  };
}

function oneOf<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

function useThumbnailImageBase() {
  const cacheRef = React.useRef(new Map<File, Promise<string>>());

  const { data: imageResizers } = useSWRImmutable('imageResizer', async () =>
    Promise.all([
      Comlink.wrap<import('../workers/resizer').Expose>(
        new Worker(new URL('../workers/resizer', import.meta.url)),
      ),
      Comlink.wrap<import('../workers/resizer').Expose>(
        new Worker(new URL('../workers/resizer', import.meta.url)),
      ),
      Comlink.wrap<import('../workers/resizer').Expose>(
        new Worker(new URL('../workers/resizer', import.meta.url)),
      ),
    ]),
  );

  return React.useMemo(() => ({ cacheRef, imageResizers }), [imageResizers]);
}

function ThumbnailImage({
  file,
  cacheRef,
  imageResizers,
  ...props
}: { file: File } & Omit<
  React.ComponentProps<typeof NextImage>,
  'src' | 'unoptimized'
> &
  ReturnType<typeof useThumbnailImageBase>) {
  const imageUrlPromise = React.useMemo(async () => {
    const imageResizer = oneOf(imageResizers ?? []);

    if (imageResizer == null) return;

    if (cacheRef.current.has(file) !== true) {
      cacheRef.current.set(
        file,
        (async () => {
          const objectUrl = URL.createObjectURL(file);

          try {
            return await imageResizer.createThumbnail(objectUrl, 1024);
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        })(),
      );
    }

    return cacheRef.current.get(file);
  }, [cacheRef, file, imageResizers]);

  const result = useSWR(imageUrlPromise, (p) => p);

  return (
    <NextImage {...props} src={result.data ?? TRANSPARENT_PIXEL} unoptimized />
  );
}

function useThumbnailImage() {
  const base = useThumbnailImageBase();

  return {
    Image: React.useCallback(
      (
        props: Omit<
          React.ComponentProps<typeof ThumbnailImage>,
          'imageResizers' | 'cacheRef'
        >,
      ) => <ThumbnailImage {...props} {...base} />,
      [base],
    ),
  };
}

export function PageClient() {
  const [images, setImages] = React.useState<File[]>([]);

  const [imagePreference, setImagePreference] = React.useState<
    Map<File, boolean>
  >(() => new Map());

  const [sortingMethod, setSortingMethod] = React.useState<'cosine' | 'forest'>(
    'cosine',
  );

  const { data: forestTrainer } = useSWRImmutable('forestTrainer', async () =>
    Comlink.wrap<import('../workers/forest').Expose>(
      new Worker(new URL('../workers/forest', import.meta.url)),
    ),
  );

  const ti = useThumbnailImage();

  const embeddingsResult = useEmbeddings({ images });
  const { imagesWithEmbeddings } = embeddingsResult;

  const forestWorkerResult = useSWRImmutable(
    forestTrainer != null && {
      forestTrainer,
      images,
      imagePreference,
      imagesWithEmbeddings,
      sortingMethod,
    },
    async (args) => {
      if (args.images.length === 0) return;

      if (sortingMethod !== 'forest') return;

      if (args.imagePreference.size === 0) return;

      const labeledImages = [...args.imagePreference.entries()].map(
        ([file, liked]) => ({
          file,
          liked,
          embedding: args.imagesWithEmbeddings.get(file)?.floatEmbedding,
        }),
      );

      if (labeledImages.some((i) => i.embedding == null)) return;

      return {
        ...(await args.forestTrainer.train({
          trainingSet: labeledImages.map((i) => i.embedding!),
          predictions: labeledImages.map((i) => (i.liked ? 1 : 0)),
        })),

        predictProba: args.forestTrainer.predictProba,
      };
    },
  );

  const predictResult = useSWRImmutable(
    {
      forestWorker: forestWorkerResult.data,
      imagesWithEmbeddings,
    },
    async (args) => {
      const predictProba = args.forestWorker?.predictProba;
      if (predictProba == null) return;

      const results = await Promise.all(
        [...imagesWithEmbeddings.entries()].map(
          async ([file, { floatEmbedding }]) => {
            if (floatEmbedding == null) return;

            const prediction = await predictProba(floatEmbedding, 1);

            return { file, prediction };
          },
        ),
      );

      return new Map(compact(results).map((r) => [r.file, r.prediction]));
    },
    { keepPreviousData: true },
  );

  const { data: imageForestPredictions } = predictResult;

  const updateImagePreference = React.useCallback(
    (args: { file: File; liked: boolean }) => {
      const { file, liked } = args;

      setImagePreference((prev) => {
        const result = produce(prev, (next) => {
          const existing = next.get(file);
          if (existing === liked) {
            next.delete(file);
          } else {
            next.set(file, liked);
          }
        });

        return result;
      });
    },
    [],
  );

  const imagesSorted = React.useMemo(() => {
    const likedImageEmbeddings = compact(
      [...imagePreference.keys()]
        .filter((file) => imagePreference.get(file) === true)
        .map((file) => imagesWithEmbeddings.get(file)),
    );

    const dislikedImageEmbeddings = compact(
      [...imagePreference.keys()]
        .filter((file) => imagePreference.get(file) === false)
        .map((file) => imagesWithEmbeddings.get(file)),
    );

    const imagesWithRankings = images.map((file) => {
      const imageFloatEmbedding =
        imagesWithEmbeddings.get(file)?.floatEmbedding;

      const score =
        imageFloatEmbedding == null
          ? undefined
          : likedImageEmbeddings.reduce((acc, liked) => {
              const likedEmbedding = liked.floatEmbedding;

              if (likedEmbedding == null) {
                return acc;
              }

              return (
                acc + cosineSimilarity(imageFloatEmbedding, likedEmbedding)
              );
            }, 0) -
            dislikedImageEmbeddings.reduce((acc, disliked) => {
              const dislikedEmbedding = disliked.floatEmbedding;

              if (dislikedEmbedding == null) {
                return acc;
              }

              return (
                acc + cosineSimilarity(imageFloatEmbedding, dislikedEmbedding)
              );
            }, 0);

      const scoreRf = imageForestPredictions?.get(file);

      return {
        file,
        score,
        scoreRf,

        scoreFinal: sortingMethod === 'forest' ? scoreRf : score,
      };
    });

    return sortBy(
      imagesWithRankings.reverse(),
      (i) => imagePreference.get(i.file) === true,
      (i) => !(imagePreference.get(i.file) === false),
      (i) => i.scoreFinal,
    ).reverse();
  }, [
    imageForestPredictions,
    imagePreference,
    images,
    imagesWithEmbeddings,
    sortingMethod,
  ]);

  return (
    <>
      <div className="flex flex-1 justify-center items-center">
        {images.length === 0 && (
          <Button
            onClick={() => {
              (async () => {
                const dirHandle = await window.showDirectoryPicker();

                let files: File[] = [];

                async function processDirectory(
                  dirHandle: FileSystemDirectoryHandle,
                ) {
                  for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file') {
                      const file = await entry.getFile();

                      if (SUPPORTED_FILE_TYPES.includes(file.type)) {
                        files.push(file);
                      }
                    } else if (entry.kind === 'directory') {
                      await processDirectory(entry);
                    }
                  }
                }

                await processDirectory(dirHandle);

                setImages(files);
              })();
            }}
          >
            Read directory
          </Button>
        )}
      </div>

      <div className="grid grid-cols-5">
        {imagesSorted.map(({ file, scoreFinal }, index) => (
          <InView rootMargin="1000px 0px" key={file.name + index}>
            {(inViewArgs) => (
              <div className="aspect-square relative" ref={inViewArgs.ref}>
                <Debounce
                  delay={0}
                  // delay={300}
                  value={inViewArgs.inView}
                >
                  {(debouncedValue) => (
                    <>
                      {debouncedValue && (
                        <ti.Image
                          file={file}
                          fill
                          alt="test"
                          className="object-cover"
                        />
                      )}
                    </>
                  )}
                </Debounce>

                <div className="absolute flex flex-col items-end bottom-0 right-0 gap-2 p-2">
                  {scoreFinal != null && (
                    <span className="text-xs rounded-full bg-secondary text-secondary-foreground py-2 px-4 font-mono">
                      {scoreFinal.toFixed(3)}
                    </span>
                  )}

                  <div className="flex flex-row gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className={cn(
                        imagePreference.get(file) === true ? '' : 'grayscale',
                      )}
                      onClick={() =>
                        updateImagePreference({ file, liked: true })
                      }
                    >
                      👍
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      className={cn(
                        imagePreference.get(file) === false ? '' : 'grayscale',
                      )}
                      onClick={() =>
                        updateImagePreference({ file, liked: false })
                      }
                    >
                      👎
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </InView>
        ))}
      </div>

      {images.length > 0 && (
        <div className="fixed bottom-4 right-4 flex gap-2 items-center bg-slate-100 p-2 rounded-full border border-slate-800">
          {embeddingsResult.progress != null &&
            embeddingsResult.progress !== 1 && (
              <>
                <span className="text-xs text-slate-800">Processing</span>

                <Progress
                  value={(embeddingsResult.progress ?? 0) * 100}
                  className="w-32"
                />
              </>
            )}

          {sortingMethod === 'forest' && forestWorkerResult.isLoading && (
            <span className="text-xs text-slate-800">Training</span>
          )}

          <Button
            onClick={() => setImagePreference(() => new Map())}
            size="sm"
            className="text-xs h-fit py-1 px-2 rounded-full"
          >
            Clear selection
          </Button>

          <RadioGroup
            value={sortingMethod}
            className="grid-flow-col"
            onValueChange={() =>
              setSortingMethod((prev) =>
                prev === 'cosine' ? 'forest' : 'cosine',
              )
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="cosine" id="sorting-cosine" />
              <Label
                className="text-xs text-slate-800"
                htmlFor="sorting-cosine"
              >
                Cosine
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="forest" id="sorting-forest" />
              <Label
                className="text-xs text-slate-800"
                htmlFor="sorting-forest"
              >
                Random forest
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}
    </>
  );
}
