import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Download, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  welchTTest,
  mannWhitneyU,
  leveneTest,
  shapiroWilk,
  holmCorrection,
  descriptiveStats,
  interpretCohensD,
  interpretRankBiserial,
  TTestResult,
  MannWhitneyResult,
  LeveneResult,
  ShapiroResult,
  DescriptiveStats,
} from '@/lib/statistics';

interface DependentVariable {
  key: string;
  label: string;
  scale: string;
  description: string;
}

const DEPENDENT_VARIABLES: DependentVariable[] = [
  { key: 'pets_total', label: 'PETS Total', scale: '10-70', description: 'Privacy and Emotional Trust Scale' },
  { key: 'pets_er', label: 'PETS-ER', scale: '6-42', description: 'Emotional Relationship subscale' },
  { key: 'pets_ut', label: 'PETS-UT', scale: '4-28', description: 'Utilitarian Trust subscale' },
  { key: 'tias_total', label: 'TIAS Total', scale: '12-84', description: 'Trust in AI Scale' },
  { key: 'godspeed_anthro_total', label: 'Godspeed Anthropomorphism', scale: '4-20', description: 'Perceived human-likeness' },
  { key: 'godspeed_like_total', label: 'Godspeed Likeability', scale: '5-25', description: 'Perceived likeability' },
  { key: 'godspeed_intel_total', label: 'Godspeed Intelligence', scale: '5-25', description: 'Perceived intelligence' },
  { key: 'intention_1', label: 'Intention 1', scale: '1-7', description: 'Behavioral intention item 1' },
  { key: 'intention_2', label: 'Intention 2', scale: '1-7', description: 'Behavioral intention item 2' },
  { key: 'formality', label: 'Perceived Formality', scale: '1-7', description: 'User-rated formality perception' },
  { key: 'ai_formality_score', label: 'F-Score (AI Formality)', scale: '0-100', description: 'Calculated linguistic formality' },
];

interface AnalysisResult {
  dv: DependentVariable;
  formalData: number[];
  informalData: number[];
  formalStats: DescriptiveStats;
  informalStats: DescriptiveStats;
  tTest: TTestResult;
  mannWhitney: MannWhitneyResult;
  levene: LeveneResult;
  shapiroFormal: ShapiroResult;
  shapiroInformal: ShapiroResult;
}

interface MultipleComparisonResult extends AnalysisResult {
  adjustedP: number;
  significant: boolean;
}

const StatisticalAnalysis = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [responses, setResponses] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from('experiment_responses')
          .select('*');

        if (error) throw error;
        setResponses(data || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const { formalResponses, informalResponses, analysisResults, multipleComparisons } = useMemo(() => {
    const formal = responses.filter(r => r.assistant_type === 'formal');
    const informal = responses.filter(r => r.assistant_type === 'informal');

    const results: AnalysisResult[] = DEPENDENT_VARIABLES.map(dv => {
      const formalData = formal
        .map(r => r[dv.key])
        .filter((v): v is number => v !== null && v !== undefined);
      const informalData = informal
        .map(r => r[dv.key])
        .filter((v): v is number => v !== null && v !== undefined);

      return {
        dv,
        formalData,
        informalData,
        formalStats: descriptiveStats(formalData),
        informalStats: descriptiveStats(informalData),
        tTest: formalData.length >= 2 && informalData.length >= 2 
          ? welchTTest(formalData, informalData)
          : { t: 0, df: 0, pValue: 1, meanDiff: 0, cohensD: 0, ci95: [0, 0] as [number, number] },
        mannWhitney: formalData.length >= 2 && informalData.length >= 2
          ? mannWhitneyU(formalData, informalData)
          : { U: 0, z: 0, pValue: 1, rankBiserialR: 0 },
        levene: formalData.length >= 2 && informalData.length >= 2
          ? leveneTest(formalData, informalData)
          : { W: 0, df1: 0, df2: 0, pValue: 1 },
        shapiroFormal: formalData.length >= 3 ? shapiroWilk(formalData) : { W: 1, pValue: 1, isNormal: true },
        shapiroInformal: informalData.length >= 3 ? shapiroWilk(informalData) : { W: 1, pValue: 1, isNormal: true },
      };
    });

    // Apply Holm correction
    const pValues = results.map(r => r.tTest.pValue);
    const adjustedPs = holmCorrection(pValues);

    const multipleComp: MultipleComparisonResult[] = results.map((r, i) => ({
      ...r,
      adjustedP: adjustedPs[i],
      significant: adjustedPs[i] < 0.05,
    }));

    return {
      formalResponses: formal,
      informalResponses: informal,
      analysisResults: results,
      multipleComparisons: multipleComp,
    };
  }, [responses]);

  const significantResults = multipleComparisons.filter(r => r.significant);

  const generatePythonScript = () => {
    const script = `"""
Statistical Analysis Script for Between-Subjects Experiment
Generated from Lovable Research Dashboard

This script performs:
1. MANOVA (if multivariate analysis is needed)
2. Univariate ANOVAs/Welch's t-tests
3. Mann-Whitney U tests (robustness checks)
4. Effect size calculations
5. Assumption checks

Requirements: pip install pandas numpy scipy pingouin statsmodels
"""

import pandas as pd
import numpy as np
from scipy import stats
import pingouin as pg
from statsmodels.multivariate.manova import MANOVA
from statsmodels.formula.api import ols
import statsmodels.api as sm
from statsmodels.stats.multicomp import multipletests

# Load your data (replace with your actual data file)
# df = pd.read_csv("experiment_data.csv")

# For this example, create sample structure based on your database schema
# Your data should have columns: assistant_type (formal/informal), and DV columns

# Define dependent variables
dvs = [
    'pets_total', 'pets_er', 'pets_ut', 'tias_total',
    'godspeed_anthro_total', 'godspeed_like_total', 'godspeed_intel_total',
    'intention_1', 'intention_2', 'formality', 'ai_formality_score'
]

def run_analysis(df):
    """Main analysis function"""
    
    # Filter to only formal and informal conditions
    df_analysis = df[df['assistant_type'].isin(['formal', 'informal'])].copy()
    
    print("=" * 60)
    print("DESCRIPTIVE STATISTICS")
    print("=" * 60)
    
    for dv in dvs:
        if dv in df_analysis.columns:
            print(f"\\n{dv}:")
            print(df_analysis.groupby('assistant_type')[dv].describe())
    
    print("\\n" + "=" * 60)
    print("ASSUMPTION CHECKS")
    print("=" * 60)
    
    # Normality tests (Shapiro-Wilk)
    print("\\nShapiro-Wilk Normality Tests:")
    for dv in dvs:
        if dv in df_analysis.columns:
            for condition in ['formal', 'informal']:
                data = df_analysis[df_analysis['assistant_type'] == condition][dv].dropna()
                if len(data) >= 3:
                    stat, p = stats.shapiro(data)
                    print(f"  {dv} ({condition}): W={stat:.4f}, p={p:.4f}")
    
    # Levene's test for equality of variances
    print("\\nLevene's Test for Equality of Variances:")
    for dv in dvs:
        if dv in df_analysis.columns:
            formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
            informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
            if len(formal) >= 2 and len(informal) >= 2:
                stat, p = stats.levene(formal, informal)
                print(f"  {dv}: W={stat:.4f}, p={p:.4f}")
    
    print("\\n" + "=" * 60)
    print("PRIMARY ANALYSIS: Welch's t-tests")
    print("=" * 60)
    
    results = []
    for dv in dvs:
        if dv in df_analysis.columns:
            formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
            informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
            
            if len(formal) >= 2 and len(informal) >= 2:
                # Welch's t-test
                t_stat, p_val = stats.ttest_ind(formal, informal, equal_var=False)
                
                # Cohen's d
                cohens_d = pg.compute_effsize(formal, informal, eftype='cohen')
                
                results.append({
                    'DV': dv,
                    't': t_stat,
                    'p': p_val,
                    'Cohen_d': cohens_d,
                    'Mean_Formal': formal.mean(),
                    'Mean_Informal': informal.mean(),
                    'Diff': formal.mean() - informal.mean()
                })
    
    results_df = pd.DataFrame(results)
    
    # Apply Holm correction
    _, p_adjusted, _, _ = multipletests(results_df['p'], method='holm')
    results_df['p_adjusted'] = p_adjusted
    results_df['Significant'] = results_df['p_adjusted'] < 0.05
    
    print(results_df.to_string(index=False))
    
    print("\\n" + "=" * 60)
    print("ROBUSTNESS CHECKS: Mann-Whitney U Tests")
    print("=" * 60)
    
    for dv in dvs:
        if dv in df_analysis.columns:
            formal = df_analysis[df_analysis['assistant_type'] == 'formal'][dv].dropna()
            informal = df_analysis[df_analysis['assistant_type'] == 'informal'][dv].dropna()
            
            if len(formal) >= 2 and len(informal) >= 2:
                mwu = pg.mwu(formal, informal)
                print(f"\\n{dv}:")
                print(mwu)
    
    print("\\n" + "=" * 60)
    print("MANOVA (if you want multivariate analysis)")
    print("=" * 60)
    print("""
    Note: MANOVA requires complete cases across all DVs.
    Only run if you have theoretical justification for treating DVs as a set.
    
    Example code:
    
    # Select DVs for MANOVA
    manova_dvs = ['pets_total', 'tias_total', 'godspeed_anthro_total']
    df_complete = df_analysis[['assistant_type'] + manova_dvs].dropna()
    
    formula = ' + '.join(manova_dvs) + ' ~ assistant_type'
    manova = MANOVA.from_formula(formula, data=df_complete)
    print(manova.mv_test())
    """)
    
    return results_df

# Run analysis
# results = run_analysis(df)

print("""
USAGE INSTRUCTIONS:
1. Load your data from CSV or database
2. Ensure 'assistant_type' column has 'formal' and 'informal' values
3. Call run_analysis(df) with your DataFrame
""")
`;

    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statistical_analysis.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateRScript = () => {
    const script = `# Statistical Analysis Script for Between-Subjects Experiment
# Generated from Lovable Research Dashboard

# Install packages if needed
# install.packages(c("dplyr", "effsize", "car", "stats"))

library(dplyr)
library(effsize)
library(car)

# Load your data
# df <- read.csv("experiment_data.csv")

# Define dependent variables
dvs <- c(
  'pets_total', 'pets_er', 'pets_ut', 'tias_total',
  'godspeed_anthro_total', 'godspeed_like_total', 'godspeed_intel_total',
  'intention_1', 'intention_2', 'formality', 'ai_formality_score'
)

run_analysis <- function(df) {
  # Filter to formal and informal conditions
  df_analysis <- df %>% filter(assistant_type %in% c('formal', 'informal'))
  
  cat("\\n", strrep("=", 60), "\\n")
  cat("DESCRIPTIVE STATISTICS\\n")
  cat(strrep("=", 60), "\\n")
  
  for (dv in dvs) {
    if (dv %in% names(df_analysis)) {
      cat("\\n", dv, ":\\n")
      print(df_analysis %>% 
              group_by(assistant_type) %>% 
              summarise(
                n = n(),
                mean = mean(get(dv), na.rm = TRUE),
                sd = sd(get(dv), na.rm = TRUE),
                min = min(get(dv), na.rm = TRUE),
                max = max(get(dv), na.rm = TRUE)
              ))
    }
  }
  
  cat("\\n", strrep("=", 60), "\\n")
  cat("ASSUMPTION CHECKS\\n")
  cat(strrep("=", 60), "\\n")
  
  # Shapiro-Wilk tests
  cat("\\nShapiro-Wilk Normality Tests:\\n")
  for (dv in dvs) {
    if (dv %in% names(df_analysis)) {
      for (condition in c('formal', 'informal')) {
        data <- df_analysis %>% 
          filter(assistant_type == condition) %>% 
          pull(!!sym(dv)) %>% 
          na.omit()
        if (length(data) >= 3 && length(data) <= 5000) {
          test <- shapiro.test(data)
          cat(sprintf("  %s (%s): W=%.4f, p=%.4f\\n", dv, condition, test$statistic, test$p.value))
        }
      }
    }
  }
  
  # Levene's tests
  cat("\\nLevene's Test for Equality of Variances:\\n")
  for (dv in dvs) {
    if (dv %in% names(df_analysis)) {
      tryCatch({
        test <- leveneTest(as.formula(paste(dv, "~ assistant_type")), data = df_analysis)
        cat(sprintf("  %s: F=%.4f, p=%.4f\\n", dv, test$\`F value\`[1], test$\`Pr(>F)\`[1]))
      }, error = function(e) {})
    }
  }
  
  cat("\\n", strrep("=", 60), "\\n")
  cat("PRIMARY ANALYSIS: Welch's t-tests\\n")
  cat(strrep("=", 60), "\\n")
  
  results <- data.frame()
  
  for (dv in dvs) {
    if (dv %in% names(df_analysis)) {
      formal <- df_analysis %>% filter(assistant_type == 'formal') %>% pull(!!sym(dv)) %>% na.omit()
      informal <- df_analysis %>% filter(assistant_type == 'informal') %>% pull(!!sym(dv)) %>% na.omit()
      
      if (length(formal) >= 2 && length(informal) >= 2) {
        # Welch's t-test
        t_test <- t.test(formal, informal, var.equal = FALSE)
        
        # Cohen's d
        d <- cohen.d(formal, informal)
        
        results <- rbind(results, data.frame(
          DV = dv,
          t = t_test$statistic,
          df = t_test$parameter,
          p = t_test$p.value,
          Cohen_d = d$estimate,
          Mean_Formal = mean(formal),
          Mean_Informal = mean(informal),
          Diff = mean(formal) - mean(informal)
        ))
      }
    }
  }
  
  # Holm correction
  results$p_adjusted <- p.adjust(results$p, method = "holm")
  results$Significant <- results$p_adjusted < 0.05
  
  print(results)
  
  cat("\\n", strrep("=", 60), "\\n")
  cat("ROBUSTNESS CHECKS: Mann-Whitney U Tests\\n")
  cat(strrep("=", 60), "\\n")
  
  for (dv in dvs) {
    if (dv %in% names(df_analysis)) {
      formal <- df_analysis %>% filter(assistant_type == 'formal') %>% pull(!!sym(dv)) %>% na.omit()
      informal <- df_analysis %>% filter(assistant_type == 'informal') %>% pull(!!sym(dv)) %>% na.omit()
      
      if (length(formal) >= 2 && length(informal) >= 2) {
        test <- wilcox.test(formal, informal)
        # Rank-biserial correlation
        n1 <- length(formal)
        n2 <- length(informal)
        r <- 1 - (2 * test$statistic) / (n1 * n2)
        cat(sprintf("\\n%s: U=%.2f, p=%.4f, r=%.4f\\n", dv, test$statistic, test$p.value, r))
      }
    }
  }
  
  return(results)
}

# Run: results <- run_analysis(df)
`;

    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'statistical_analysis.R';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSignificanceIcon = (pValue: number, adjusted: boolean = false) => {
    const threshold = 0.05;
    if (pValue < 0.001) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (pValue < threshold) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (pValue < 0.1) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const formatP = (p: number) => {
    if (p < 0.001) return '< .001';
    if (p < 0.01) return p.toFixed(3);
    return p.toFixed(3);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Statistical Analysis</h1>
              <p className="text-muted-foreground">
                Between-subjects comparison: Formal (n={formalResponses.length}) vs Informal (n={informalResponses.length})
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generatePythonScript}>
              <Download className="h-4 w-4 mr-2" />
              Python Script
            </Button>
            <Button variant="outline" onClick={generateRScript}>
              <Download className="h-4 w-4 mr-2" />
              R Script
            </Button>
          </div>
        </div>

        {/* Interpretation Guide */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Analysis Approach</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              This analysis uses <strong>Welch's t-tests</strong> as the primary method (robust to unequal variances),
              with <strong>Holm-Bonferroni correction</strong> for multiple comparisons. <strong>Mann-Whitney U tests</strong> are
              provided as robustness checks for ordinal/non-normal data.
            </p>
            <p className="text-sm">
              <strong>Effect size interpretation:</strong> Cohen's d: |d| &lt; 0.2 negligible, 0.2-0.5 small, 0.5-0.8 medium, &gt; 0.8 large
            </p>
          </AlertDescription>
        </Alert>

        {/* Summary of Significant Results */}
        {significantResults.length > 0 && (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Significant Results (after Holm correction)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {significantResults.map(r => (
                  <Badge key={r.dv.key} variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    {r.dv.label}: d = {r.tTest.cohensD.toFixed(2)} ({interpretCohensD(r.tTest.cohensD)})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="descriptive">Descriptive Stats</TabsTrigger>
            <TabsTrigger value="inferential">Inferential Tests</TabsTrigger>
            <TabsTrigger value="assumptions">Assumption Checks</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Primary Analysis Results</CardTitle>
                <CardDescription>
                  Welch's t-tests with Holm-Bonferroni correction for multiple comparisons
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">Formal (M ± SD)</TableHead>
                        <TableHead className="text-center">Informal (M ± SD)</TableHead>
                        <TableHead className="text-center">t</TableHead>
                        <TableHead className="text-center">p</TableHead>
                        <TableHead className="text-center">p (adj)</TableHead>
                        <TableHead className="text-center">Cohen's d</TableHead>
                        <TableHead className="text-center">Effect</TableHead>
                        <TableHead className="text-center">Sig</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {multipleComparisons.map((result) => (
                        <TableRow key={result.dv.key} className={result.significant ? 'bg-green-50/50 dark:bg-green-950/20' : ''}>
                          <TableCell className="font-medium">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{result.dv.label}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{result.dv.description}</p>
                                <p className="text-xs text-muted-foreground">Scale: {result.dv.scale}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center">
                            {result.formalStats.mean.toFixed(2)} ± {result.formalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            {result.informalStats.mean.toFixed(2)} ± {result.informalStats.std.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.tTest.t.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {formatP(result.tTest.pValue)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            <span className={result.significant ? 'font-bold text-green-600' : ''}>
                              {formatP(result.adjustedP)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.tTest.cohensD.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {interpretCohensD(result.tTest.cohensD)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {getSignificanceIcon(result.adjustedP)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Robustness Checks: Mann-Whitney U</CardTitle>
                <CardDescription>
                  Non-parametric tests as sensitivity analyses (not primary inference)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">U</TableHead>
                        <TableHead className="text-center">z</TableHead>
                        <TableHead className="text-center">p</TableHead>
                        <TableHead className="text-center">Rank-biserial r</TableHead>
                        <TableHead className="text-center">Effect</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.mannWhitney.U.toFixed(0)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.mannWhitney.z.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {formatP(result.mannWhitney.pValue)}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {result.mannWhitney.rankBiserialR.toFixed(3)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {interpretRankBiserial(result.mannWhitney.rankBiserialR)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="descriptive" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Descriptive Statistics by Condition</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead rowSpan={2}>Variable</TableHead>
                        <TableHead colSpan={5} className="text-center border-l bg-blue-50 dark:bg-blue-950/30">Formal</TableHead>
                        <TableHead colSpan={5} className="text-center border-l bg-amber-50 dark:bg-amber-950/30">Informal</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-center border-l bg-blue-50 dark:bg-blue-950/30">n</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">M</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">SD</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">Mdn</TableHead>
                        <TableHead className="text-center bg-blue-50 dark:bg-blue-950/30">Range</TableHead>
                        <TableHead className="text-center border-l bg-amber-50 dark:bg-amber-950/30">n</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">M</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">SD</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">Mdn</TableHead>
                        <TableHead className="text-center bg-amber-50 dark:bg-amber-950/30">Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell className="font-medium">{result.dv.label}</TableCell>
                          <TableCell className="text-center border-l bg-blue-50/30 dark:bg-blue-950/10">{result.formalStats.n}</TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">{result.formalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">{result.formalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10">{result.formalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-blue-50/30 dark:bg-blue-950/10 text-xs">
                            {result.formalStats.min.toFixed(1)}-{result.formalStats.max.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-center border-l bg-amber-50/30 dark:bg-amber-950/10">{result.informalStats.n}</TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">{result.informalStats.mean.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">{result.informalStats.std.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10">{result.informalStats.median.toFixed(2)}</TableCell>
                          <TableCell className="text-center bg-amber-50/30 dark:bg-amber-950/10 text-xs">
                            {result.informalStats.min.toFixed(1)}-{result.informalStats.max.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inferential" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {analysisResults.map((result) => (
                <Card key={result.dv.key}>
                  <CardHeader>
                    <CardTitle className="text-lg">{result.dv.label}</CardTitle>
                    <CardDescription>{result.dv.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                        <p className="text-xs text-muted-foreground">Formal</p>
                        <p className="text-lg font-bold">{result.formalStats.mean.toFixed(2)}</p>
                        <p className="text-xs">SD = {result.formalStats.std.toFixed(2)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                        <p className="text-xs text-muted-foreground">Informal</p>
                        <p className="text-lg font-bold">{result.informalStats.mean.toFixed(2)}</p>
                        <p className="text-xs">SD = {result.informalStats.std.toFixed(2)}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <p><strong>Welch's t-test:</strong> t({result.tTest.df.toFixed(1)}) = {result.tTest.t.toFixed(2)}, p = {formatP(result.tTest.pValue)}</p>
                      <p><strong>Cohen's d:</strong> {result.tTest.cohensD.toFixed(3)} ({interpretCohensD(result.tTest.cohensD)})</p>
                      <p><strong>95% CI:</strong> [{result.tTest.ci95[0].toFixed(2)}, {result.tTest.ci95[1].toFixed(2)}]</p>
                      <p className="text-muted-foreground">
                        <strong>Mann-Whitney U:</strong> {result.mannWhitney.U.toFixed(0)}, z = {result.mannWhitney.z.toFixed(2)}, 
                        p = {formatP(result.mannWhitney.pValue)}, r = {result.mannWhitney.rankBiserialR.toFixed(3)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="assumptions" className="space-y-6">
            <Alert variant="default">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Interpreting Assumption Checks</AlertTitle>
              <AlertDescription>
                Welch's t-test is robust to violations of equal variances. For normality violations with n &gt; 30, 
                the Central Limit Theorem provides robustness. Mann-Whitney U tests are provided as non-parametric alternatives.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Levene's Test (Equality of Variances)</CardTitle>
                  <CardDescription>H₀: Variances are equal. p &gt; .05 suggests equal variances.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">W</TableHead>
                        <TableHead className="text-center">p</TableHead>
                        <TableHead className="text-center">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell>{result.dv.label}</TableCell>
                          <TableCell className="text-center font-mono">{result.levene.W.toFixed(2)}</TableCell>
                          <TableCell className="text-center font-mono">{formatP(result.levene.pValue)}</TableCell>
                          <TableCell className="text-center">
                            {result.levene.pValue > 0.05 ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700">Equal</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700">Unequal</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Shapiro-Wilk Test (Normality)</CardTitle>
                  <CardDescription>H₀: Data is normally distributed. p &gt; .05 suggests normality.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variable</TableHead>
                        <TableHead className="text-center">Formal (p)</TableHead>
                        <TableHead className="text-center">Informal (p)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysisResults.map((result) => (
                        <TableRow key={result.dv.key}>
                          <TableCell>{result.dv.label}</TableCell>
                          <TableCell className="text-center">
                            <span className={result.shapiroFormal.isNormal ? 'text-green-600' : 'text-amber-600'}>
                              {formatP(result.shapiroFormal.pValue)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={result.shapiroInformal.isNormal ? 'text-green-600' : 'text-amber-600'}>
                              {formatP(result.shapiroInformal.pValue)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Interpretation Section */}
        <Card>
          <CardHeader>
            <CardTitle>Interpretation Guide</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert max-w-none">
            <h4>What the Analysis Tests</h4>
            <p>
              This analysis examines whether participants in the <strong>Formal</strong> condition differ significantly 
              from participants in the <strong>Informal</strong> condition across multiple dependent variables 
              (trust scales, perceptions, and behavioral intentions).
            </p>

            <h4>When Follow-ups Are Needed</h4>
            <p>
              If conducting a MANOVA first, follow-up univariate tests (shown here) are only interpreted if the 
              multivariate test is significant. The downloadable scripts include MANOVA code for this purpose.
            </p>

            <h4>How to Interpret Effect Sizes</h4>
            <ul>
              <li><strong>Cohen's d:</strong> Standardized mean difference. |d| &lt; 0.2 negligible, 0.2-0.5 small, 0.5-0.8 medium, &gt; 0.8 large</li>
              <li><strong>Rank-biserial r:</strong> Non-parametric effect size. Same thresholds as correlation coefficients.</li>
            </ul>

            <h4>Multiple Comparisons</h4>
            <p>
              Holm-Bonferroni correction controls family-wise error rate while being less conservative than Bonferroni. 
              The adjusted p-values should be used for determining statistical significance.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StatisticalAnalysis;
