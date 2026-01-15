/**
 * Statistical Analysis Utilities for Between-Subjects Experiment
 * Implements Welch's t-test, Mann-Whitney U, effect sizes, and assumption checks
 */

// Standard normal distribution CDF approximation (Abramowitz and Stegun)
export const normalCDF = (x: number): number => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
};

// T-distribution CDF approximation using normal for large df
export const tCDF = (t: number, df: number): number => {
  if (df > 100) return normalCDF(t);
  
  // Use numerical integration for smaller df (simplified)
  const x = df / (df + t * t);
  return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
};

// Incomplete beta function approximation
const incompleteBeta = (a: number, b: number, x: number): number => {
  if (x === 0) return 0;
  if (x === 1) return 1;
  
  // Use continued fraction for better accuracy
  const bt = x === 0 || x === 1 ? 0 :
    Math.exp(gammaLn(a + b) - gammaLn(a) - gammaLn(b) + a * Math.log(x) + b * Math.log(1 - x));
  
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(a, b, x) / a;
  } else {
    return 1 - bt * betaCF(b, a, 1 - x) / b;
  }
};

// Beta continued fraction
const betaCF = (a: number, b: number, x: number): number => {
  const maxIterations = 100;
  const epsilon = 1e-10;
  
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let h = d;
  
  for (let m = 1; m <= maxIterations; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }
  return h;
};

// Log gamma function (Lanczos approximation)
const gammaLn = (x: number): number => {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];
  
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += c[j] / ++y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
};

// F-distribution CDF
export const fCDF = (f: number, df1: number, df2: number): number => {
  if (f <= 0) return 0;
  const x = df1 * f / (df1 * f + df2);
  return incompleteBeta(df1 / 2, df2 / 2, x);
};

// Basic statistics
export const mean = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

export const variance = (arr: number[], ddof: number = 1): number => {
  if (arr.length <= ddof) return 0;
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - ddof);
};

export const std = (arr: number[], ddof: number = 1): number => Math.sqrt(variance(arr, ddof));

export const sem = (arr: number[]): number => std(arr) / Math.sqrt(arr.length);

// Welch's t-test (two independent samples, unequal variances)
export interface TTestResult {
  t: number;
  df: number;
  pValue: number;
  meanDiff: number;
  cohensD: number;
  ci95: [number, number];
}

export const welchTTest = (group1: number[], group2: number[]): TTestResult => {
  const n1 = group1.length;
  const n2 = group2.length;
  const m1 = mean(group1);
  const m2 = mean(group2);
  const v1 = variance(group1);
  const v2 = variance(group2);
  
  const se1 = v1 / n1;
  const se2 = v2 / n2;
  const se = Math.sqrt(se1 + se2);
  
  const t = (m1 - m2) / se;
  
  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(se1 + se2, 2) / (
    Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1)
  );
  
  // Two-tailed p-value
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));
  
  // Cohen's d (pooled std)
  const pooledStd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const cohensD = (m1 - m2) / pooledStd;
  
  // 95% CI for mean difference
  const tCrit = 1.96; // approximation for large df
  const ci95: [number, number] = [
    (m1 - m2) - tCrit * se,
    (m1 - m2) + tCrit * se
  ];
  
  return { t, df, pValue, meanDiff: m1 - m2, cohensD, ci95 };
};

// Mann-Whitney U test (non-parametric)
export interface MannWhitneyResult {
  U: number;
  z: number;
  pValue: number;
  rankBiserialR: number;
}

export const mannWhitneyU = (group1: number[], group2: number[]): MannWhitneyResult => {
  const n1 = group1.length;
  const n2 = group2.length;
  
  // Combine and rank
  const combined = [
    ...group1.map(v => ({ value: v, group: 1 })),
    ...group2.map(v => ({ value: v, group: 2 }))
  ].sort((a, b) => a.value - b.value);
  
  // Assign ranks (handle ties)
  const ranks: number[] = [];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j < combined.length && combined[j].value === combined[i].value) {
      j++;
    }
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }
  
  // Sum of ranks for group 1
  let R1 = 0;
  for (let k = 0; k < combined.length; k++) {
    if (combined[k].group === 1) {
      R1 += ranks[k];
    }
  }
  
  // U statistic
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  
  // Normal approximation (for n > 20)
  const mU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (U1 - mU) / sigmaU;
  
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  
  // Rank-biserial correlation (effect size)
  const rankBiserialR = 1 - (2 * U) / (n1 * n2);
  
  return { U, z, pValue, rankBiserialR };
};

// Levene's test for equality of variances
export interface LeveneResult {
  W: number;
  df1: number;
  df2: number;
  pValue: number;
}

export const leveneTest = (group1: number[], group2: number[]): LeveneResult => {
  const n1 = group1.length;
  const n2 = group2.length;
  const N = n1 + n2;
  const k = 2;
  
  const m1 = mean(group1);
  const m2 = mean(group2);
  
  // Absolute deviations from group medians (using mean for simplicity)
  const z1 = group1.map(x => Math.abs(x - m1));
  const z2 = group2.map(x => Math.abs(x - m2));
  
  const z1Mean = mean(z1);
  const z2Mean = mean(z2);
  const zGrandMean = (z1Mean * n1 + z2Mean * n2) / N;
  
  const numerator = (N - k) * (
    n1 * Math.pow(z1Mean - zGrandMean, 2) + 
    n2 * Math.pow(z2Mean - zGrandMean, 2)
  );
  
  const denominator = (k - 1) * (
    z1.reduce((sum, z) => sum + Math.pow(z - z1Mean, 2), 0) +
    z2.reduce((sum, z) => sum + Math.pow(z - z2Mean, 2), 0)
  );
  
  const W = numerator / denominator;
  const df1 = k - 1;
  const df2 = N - k;
  const pValue = 1 - fCDF(W, df1, df2);
  
  return { W, df1, df2, pValue };
};

// Shapiro-Wilk test approximation (simplified)
export interface ShapiroResult {
  W: number;
  pValue: number;
  isNormal: boolean;
}

export const shapiroWilk = (data: number[]): ShapiroResult => {
  const n = data.length;
  if (n < 3) return { W: 1, pValue: 1, isNormal: true };
  
  const sorted = [...data].sort((a, b) => a - b);
  const m = mean(data);
  
  // Simplified W statistic calculation
  const ss = data.reduce((sum, x) => sum + Math.pow(x - m, 2), 0);
  
  // Approximate W using correlation with normal scores
  let b = 0;
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    const z = normalQuantile(p);
    b += z * sorted[i];
  }
  
  const W = (b * b) / (ss * normalOrderStatCoeff(n));
  
  // Approximate p-value (simplified)
  const pValue = W > 0.95 ? 0.5 : W > 0.9 ? 0.1 : W > 0.85 ? 0.05 : 0.01;
  
  return { W: Math.min(W, 1), pValue, isNormal: pValue > 0.05 };
};

// Normal quantile function (inverse CDF)
const normalQuantile = (p: number): number => {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Rational approximation
  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01
  ];
  
  const q = p < 0.5 ? p : 1 - p;
  const r = Math.sqrt(-2 * Math.log(q));
  
  let x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) /
          (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  
  return p < 0.5 ? -x : x;
};

const normalOrderStatCoeff = (n: number): number => {
  // Approximation for the sum of squared normal order statistic coefficients
  return 1 + 0.221 / Math.sqrt(n) - 0.147 / n;
};

// Holm-Bonferroni correction
export const holmCorrection = (pValues: number[]): number[] => {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  
  const adjusted = new Array(n).fill(0);
  let runningMax = 0;
  
  for (let j = 0; j < n; j++) {
    const multiplier = n - j;
    const adjustedP = Math.min(indexed[j].p * multiplier, 1);
    runningMax = Math.max(runningMax, adjustedP);
    adjusted[indexed[j].i] = runningMax;
  }
  
  return adjusted;
};

// Partial eta squared
export const partialEtaSquared = (ssEffect: number, ssError: number): number => {
  return ssEffect / (ssEffect + ssError);
};

// Interpret Cohen's d
export const interpretCohensD = (d: number): string => {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
};

// Interpret rank-biserial r
export const interpretRankBiserial = (r: number): string => {
  const absR = Math.abs(r);
  if (absR < 0.1) return 'negligible';
  if (absR < 0.3) return 'small';
  if (absR < 0.5) return 'medium';
  return 'large';
};

// Descriptive statistics summary
export interface DescriptiveStats {
  n: number;
  mean: number;
  std: number;
  sem: number;
  min: number;
  max: number;
  median: number;
  q1: number;
  q3: number;
}

export const descriptiveStats = (data: number[]): DescriptiveStats => {
  if (data.length === 0) {
    return { n: 0, mean: 0, std: 0, sem: 0, min: 0, max: 0, median: 0, q1: 0, q3: 0 };
  }
  
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  
  const getQuantile = (p: number) => {
    const idx = p * (n - 1);
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    if (low === high) return sorted[low];
    return sorted[low] * (high - idx) + sorted[high] * (idx - low);
  };
  
  return {
    n,
    mean: mean(data),
    std: std(data),
    sem: sem(data),
    min: sorted[0],
    max: sorted[n - 1],
    median: getQuantile(0.5),
    q1: getQuantile(0.25),
    q3: getQuantile(0.75)
  };
};
