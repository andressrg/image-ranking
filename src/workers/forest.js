importScripts(
  'https://cdn.jsdelivr.net/npm/comlink@4.4.1/dist/umd/comlink.min.js',
);

/////////////////////////////////////////////////////////////////////////////
// Created using Sonnet 3.5
/////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} DataPoint
 * @property {number[]} features - The input features of the data point
 * @property {number} label - The class label of the data point
 */

/**
 * @typedef {Object} TreeNode
 * @property {number|null} featureIndex - The index of the feature to split on (null for leaf nodes)
 * @property {number|null} threshold - The threshold for the split (null for leaf nodes)
 * @property {TreeNode|null} left - The left child node (null for leaf nodes)
 * @property {TreeNode|null} right - The right child node (null for leaf nodes)
 * @property {Object|null} distribution - The class distribution for leaf nodes (null for non-leaf nodes)
 */

/**
 * @typedef {Object} DecisionTree
 * @property {TreeNode} root - The root node of the decision tree
 * @property {function(number[]): number} predict - Function to predict the class of a new data point
 * @property {function(number[], number): number} predictProba - Function to predict the probability of a specific class for a new data point
 * @property {function(number[]): Object} predictProbaAll - Function to predict probabilities of all classes for a new data point
 */

/**
 * @typedef {Object} RandomForest
 * @property {DecisionTree[]} trees - The decision trees in the forest
 * @property {function(number[]): number} predict - Function to predict the class of a new data point
 * @property {function(number[], number): number} predictProba - Function to predict the probability of a specific class for a new data point
 * @property {function(number[]): Object} predictProbaAll - Function to predict probabilities of all classes for a new data point
 */

/**
 * Calculates the Gini impurity of a set of labels
 * @param {number[]} labels - The labels to calculate impurity for
 * @returns {number} The Gini impurity
 */
function giniImpurity(labels) {
  const counts = {};
  labels.forEach((label) => {
    counts[label] = (counts[label] || 0) + 1;
  });
  const total = labels.length;
  return (
    1 -
    Object.values(counts).reduce(
      (sum, count) => sum + Math.pow(count / total, 2),
      0,
    )
  );
}

/**
 * @typedef {Object} SplitOptions
 * @property {DataPoint[]} data - The dataset to split
 * @property {number[]} featureIndices - The indices of features to consider for splitting
 */

/**
 * Finds the best split for a dataset
 * @param {SplitOptions} options - The options for finding the best split
 * @returns {Object} The best split information
 */
function findBestSplit({ data, featureIndices }) {
  let bestGini = Infinity;
  let bestSplit = null;

  for (const featureIndex of featureIndices) {
    const values = data
      .map((d) => d.features[featureIndex])
      .sort((a, b) => a - b);
    const uniqueValues = [...new Set(values)];

    for (let i = 0; i < uniqueValues.length - 1; i++) {
      const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;
      const left = data.filter((d) => d.features[featureIndex] <= threshold);
      const right = data.filter((d) => d.features[featureIndex] > threshold);

      const gini =
        (left.length / data.length) * giniImpurity(left.map((d) => d.label)) +
        (right.length / data.length) * giniImpurity(right.map((d) => d.label));

      if (gini < bestGini) {
        bestGini = gini;
        bestSplit = { featureIndex, threshold, left, right };
      }
    }
  }

  return bestSplit;
}

/**
 * @typedef {Object} DecisionTreeOptions
 * @property {DataPoint[]} data - The training data
 * @property {number} maxDepth - The maximum depth of the tree
 * @property {number} minSamplesSplit - The minimum number of samples required to split an internal node
 * @property {number} numFeatures - The number of features to consider for each split
 */

/**
 * Creates a decision tree using the CART algorithm
 * @param {DecisionTreeOptions} options - The options for creating the decision tree
 * @returns {DecisionTree} The trained decision tree
 */
function createDecisionTree({ data, maxDepth, minSamplesSplit, numFeatures }) {
  function buildTree(data, depth) {
    if (
      depth === maxDepth ||
      data.length < minSamplesSplit ||
      new Set(data.map((d) => d.label)).size === 1
    ) {
      const distribution = {};
      data.forEach((d) => {
        distribution[d.label] = (distribution[d.label] || 0) + 1;
      });
      Object.keys(distribution).forEach((key) => {
        distribution[key] /= data.length;
      });
      return { distribution };
    }

    const featureIndices = Array.from(
      { length: data[0].features.length },
      (_, i) => i,
    );
    const selectedFeatures = featureIndices
      .sort(() => 0.5 - Math.random())
      .slice(0, numFeatures);
    const split = findBestSplit({ data, featureIndices: selectedFeatures });

    if (!split) {
      const distribution = {};
      data.forEach((d) => {
        distribution[d.label] = (distribution[d.label] || 0) + 1;
      });
      Object.keys(distribution).forEach((key) => {
        distribution[key] /= data.length;
      });
      return { distribution };
    }

    const { featureIndex, threshold, left, right } = split;
    return {
      featureIndex,
      threshold,
      left: buildTree(left, depth + 1),
      right: buildTree(right, depth + 1),
    };
  }

  const root = buildTree(data, 0);

  return {
    root,
    predict: (features) => {
      let node = root;
      while (node.featureIndex !== undefined) {
        if (features[node.featureIndex] <= node.threshold) {
          node = node.left;
        } else {
          node = node.right;
        }
      }
      return Object.keys(node.distribution).reduce((a, b) =>
        node.distribution[a] > node.distribution[b] ? a : b,
      );
    },
    predictProba: (features, className) => {
      let node = root;
      while (node.featureIndex !== undefined) {
        if (features[node.featureIndex] <= node.threshold) {
          node = node.left;
        } else {
          node = node.right;
        }
      }
      return node.distribution[className] || 0;
    },
    predictProbaAll: (features) => {
      let node = root;
      while (node.featureIndex !== undefined) {
        if (features[node.featureIndex] <= node.threshold) {
          node = node.left;
        } else {
          node = node.right;
        }
      }
      return node.distribution;
    },
  };
}

/**
 * @typedef {Object} RandomForestOptions
 * @property {number} numTrees - The number of trees in the forest
 * @property {number} maxDepth - The maximum depth of each tree
 * @property {number} minSamplesSplit - The minimum number of samples required to split an internal node
 * @property {number} numFeatures - The number of features to consider for each split
 */

/**
 * Creates a random forest classifier
 * @param {RandomForestOptions} options - The options for creating the random forest
 * @returns {Object} The random forest object with train, predict, predictProba, and predictProbaAll methods
 */
function createRandomForest({
  numTrees,
  maxDepth,
  minSamplesSplit,
  numFeatures,
}) {
  return {
    /**
     * Trains the random forest on the given data
     * @param {DataPoint[]} data - The training data
     * @returns {RandomForest} The trained random forest
     */
    train: (data) => {
      const trees = [];
      for (let i = 0; i < numTrees; i++) {
        // Bagging: create a bootstrap sample
        const baggedData = Array.from(
          { length: data.length },
          () => data[Math.floor(Math.random() * data.length)],
        );
        trees.push(
          createDecisionTree({
            data: baggedData,
            maxDepth,
            minSamplesSplit,
            numFeatures,
          }),
        );
      }

      return {
        trees,
        predict: (features) => {
          const predictions = trees.map((tree) => tree.predict(features));
          const counts = {};
          predictions.forEach((p) => {
            counts[p] = (counts[p] || 0) + 1;
          });
          return Object.keys(counts).reduce((a, b) =>
            counts[a] > counts[b] ? a : b,
          );
        },
        predictProba: (features, className) => {
          const probas = trees.map((tree) =>
            tree.predictProba(features, className),
          );
          return probas.reduce((sum, proba) => sum + proba, 0) / trees.length;
        },
        predictProbaAll: (features) => {
          const probas = trees.map((tree) => tree.predictProbaAll(features));
          const avgProba = {};
          probas.forEach((p) => {
            Object.keys(p).forEach((key) => {
              avgProba[key] = (avgProba[key] || 0) + p[key] / trees.length;
            });
          });
          return avgProba;
        },
      };
    },
  };
}

// // Example usage
// const trainingData = [
//   { features: [1, 2, 3], label: 0 },
//   { features: [4, 5, 6], label: 1 },
//   { features: [7, 8, 9], label: 1 },
//   { features: [2, 3, 4], label: 0 },
//   { features: [5, 6, 7], label: 1 },
// ];

// const rf = createRandomForest({
//   numTrees: 10,
//   maxDepth: 5,
//   minSamplesSplit: 2,
//   numFeatures: 2,
// });

// const trainedForest = rf.train(trainingData);

// const features = [3, 4, 5];
// const prediction = trainedForest.predict(features);
// console.log('Prediction:', prediction);

// const probabilityClass0 = trainedForest.predictProba(features, 0);
// console.log('Probability for class 0:', probabilityClass0);

// const probabilityClass1 = trainedForest.predictProba(features, 1);
// console.log('Probability for class 1:', probabilityClass1);

// const allProbabilities = trainedForest.predictProbaAll(features);
// console.log('All probabilities:', allProbabilities);

/////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} Expose
 * @property {function({ trainingSet: number[][]; predictions: number[] }): { version: number }} train
 * @property {function(number[], number): number} predictProba
 */

let trainedForest;

/** @type {Expose} */
const object = {
  train({ predictions, trainingSet }) {
    const rf = createRandomForest({
      numTrees: 100,
      maxDepth: 20,
      minSamplesSplit: 2,
      numFeatures: trainingSet[0]?.length ?? 0,
    });

    trainedForest = rf.train(
      trainingSet.map((features, i) => ({
        features,
        label: predictions[i],
      })),
    );

    return { version: Date.now() };
  },

  predictProba(features, c) {
    return trainedForest.predictProba(features, c);
  },
};

Comlink.expose(object);
