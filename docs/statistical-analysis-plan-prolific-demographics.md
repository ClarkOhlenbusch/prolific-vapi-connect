# Statistical Analysis Plan: Prolific Demographics × Study Measures

This document outlines analyses using the Prolific demographic export CSV joined with study outcome data (questionnaire scores, intention, formality). Goal: explore many predictor–outcome combinations so promising effects can be followed up (e.g. effect of age or gender on trust, satisfaction, intention).

---

## 1. Data sources

- **Prolific export CSV** (predictors/covariates): `Submission id`, `Participant id`, `Status`, `Time taken`, `Telemedicine`, `Gender`, `Hearing difficulties`, `Speech disorders`, `Depression`, `Mental health diagnosis`, `Ai chatbots`, `Harmful content`, `Age`, `Sex`, `Ethnicity simplified`, `Country of birth/residence`, `Nationality`, `Language`, `Student status`, `Employment status`.
- **Study DB** (outcomes): join by `Participant id` (Prolific) / `prolific_id` (app). Outcomes: PETS-ER, PETS-UT, PETS total, TIAS total, Godspeed (anthropomorphism, likeability, intelligence), intention_1/2, perceived formality, AI formality (F-score); baseline: TIPI subscales.

**Exclusions:** Drop rows with `Status` = RETURNED or where key demographics are CONSENT_REVOKED / missing. For time-to-complete analyses, consider excluding extreme `Time taken` (e.g. &lt; 5 min or &gt; 2 h) as sensitivity.

---

## 2. Predictors (from CSV) – coding for analysis

| Variable | Suggested coding | Use as |
|----------|------------------|--------|
| **Age** | Continuous (years); optionally bin: 60–64, 65–69, 70+ | Covariate / moderator / subgroup |
| **Sex** | Male / Female (from `Sex`; `Gender` has more categories) | Factor |
| **Gender** | Woman / Man (or collapse non-binary if n small) | Factor (alternative to Sex) |
| **Ethnicity simplified** | White / Black / Other (or keep all levels if n allows) | Factor |
| **Telemedicine** | Yes / No | Factor |
| **Hearing difficulties** | Yes / No | Factor |
| **Speech disorders** | No / Yes (collapse Articulation/Voice if needed) | Factor |
| **Depression** | Yes / No | Factor |
| **Mental health diagnosis** | Yes / No | Factor |
| **Ai chatbots** | None vs Any (or: None / 1 tool / 2+ tools) | Factor / ordinal |
| **Harmful content** | Yes / No | Factor |
| **Employment status** | Full-Time / Part-Time / Not in paid work / Other | Factor |
| **Student status** | Yes / No (ignore DATA_EXPIRED if present) | Factor |
| **Country of residence** | US vs non-US (or keep country if n allows) | Factor |
| **Time taken** | Continuous (seconds); log if skewed | Covariate / outcome |

---

## 3. Outcomes (from study)

**Primary / hypothesis-relevant:**  
PETS-ER, PETS-UT, PETS total, TIAS total, intention_1, intention_2.

**Exploratory:**  
Godspeed anthropomorphism, likeability, intelligence; perceived formality; AI formality (F-score).

**Baseline (covariates for balance, or secondary outcomes):**  
TIPI extraversion, agreeableness, conscientiousness, emotional stability, openness.

---

## 4. Analysis plan (“throw spaghetti at the wall”)

Run as many of these as sample size and missing data allow. Report effect sizes and CIs; interpret with multiplicity in mind (exploratory).

### 4.1 Demographics × each outcome (univariate)

For each **predictor** and each **outcome**:

- **Continuous predictor (Age):** Pearson or Spearman correlation with each outcome; simple regression (outcome ~ age). Optional: outcome ~ age + condition (formal/informal) to see if age effect holds within condition.
- **Categorical predictors (Sex, Gender, Ethnicity, Telemedicine, Hearing, Speech, Depression, Mental health, Ai chatbots, Harmful content, Employment, Student, Country):**
  - Compare means (or medians) across groups: t-test (2 groups) or one-way ANOVA / Kruskal–Wallis (3+ groups).
  - Effect size: Cohen’s d (2 groups) or η² / ε² (3+ groups).

Examples:

- Age × PETS total, TIAS, Godspeed, intention.
- Sex × all outcomes.
- Hearing difficulties (Yes vs No) × all outcomes.
- Speech disorders (Yes vs No) × all outcomes.
- Telemedicine (Yes vs No) × all outcomes.
- Depression / Mental health diagnosis × all outcomes.
- Ai chatbots (None vs Any) × all outcomes.
- Employment status × all outcomes.
- Ethnicity (White vs Black vs Other) × all outcomes.

### 4.2 Subgroup analyses

- **By Sex:** Run main hypothesis tests (formal vs informal) separately in Male and Female; compare effect sizes (e.g. Cohen’s d) and CIs.
- **By Age group:** e.g. 60–64 vs 65–69 vs 70+; same as above per group.
- **By Telemedicine:** Yes vs No.
- **By Hearing / Speech:** Yes vs No (if n sufficient).
- **By AI chatbot use:** None vs Any.
- **By Mental health / Depression:** Yes vs No (if n sufficient).

Report: point estimate and CI for each subgroup; note overlap of CIs and power.

### 4.3 Moderation (condition × demographic)

Test whether the **formal vs informal** effect depends on the demographic:

- **Condition × Age:** e.g. PETS-ER ~ condition + age + condition×age (linear regression). If interaction p &lt; .10, follow up with simple slopes or subgroup analyses.
- **Condition × Sex:** Two-way ANOVA or regression with condition, sex, condition×sex for each outcome.
- **Condition × Telemedicine, Hearing, Speech, Depression, Mental health, Ai chatbots:** Same structure (condition + predictor + interaction).

Prioritise: Condition × Age, Condition × Sex, Condition × Telemedicine, Condition × AI chatbot use.

### 4.4 Multiple regression / ANCOVA

For each primary outcome (e.g. PETS total, TIAS, intention):

- **Model 1:** outcome ~ condition (formal/informal).
- **Model 2:** outcome ~ condition + age + sex (+ ethnicity if n allows).
- **Model 3:** outcome ~ condition + age + sex + telemedicine + hearing + speech + depression + mental_health + ai_chatbots (+ employment/student if of interest).

Compare condition effect (β or mean difference) and its CI across models to see if it’s robust to covariates. Check VIF if many predictors.

### 4.5 Correlation matrix

- **Predictors:** age, time_taken (and optionally TIPI subscales from study).
- **Outcomes:** all questionnaire totals and subscales, intention, formality.

Report Pearson (or Spearman if non-normal) correlation matrix; flag |r| &gt; .3 and p &lt; .05 for discussion.

### 4.6 Balance checks (randomization / selection)

- Compare **Age, Sex, Ethnicity** (and optionally Telemedicine, Hearing, Employment) between **formal** and **informal** conditions (t-test, chi-square). If imbalance, use these as covariates in primary models (as in 4.4).

### 4.7 Time and engagement

- **Time taken** (from CSV) vs **outcomes:** correlation or regression (e.g. PETS ~ time_taken + condition) to see if longer time relates to different scores.
- **Time taken** by **demographics:** e.g. by Sex, Age group, Hearing, to see if subgroups differ in engagement/time.

### 4.8 Specific “spaghetti” contrasts

- **Older (e.g. 70+) vs younger (60–64):** Compare all outcomes (t-test or Mann–Whitney); repeat for formal and informal separately.
- **Women vs men:** Same.
- **With vs without hearing difficulties:** Same (if n ≥ ~10 per cell).
- **With vs without speech disorders:** Same.
- **With vs without telemedicine experience:** Same.
- **AI chatbot None vs Any:** Same.
- **With vs without mental health / depression:** Same (if n allows).
- **Employment:** Full-time vs not in paid work vs other (ANOVA or Kruskal–Wallis on key outcomes).
- **Ethnicity:** White vs Black vs Other (if n allows).

---

## 5. Implementation notes

- **Join:** Match CSV `Participant id` to study data `prolific_id`; keep only participants with both demographic and outcome data.
- **Missing:** Report n per analysis; consider sensitivity (e.g. complete case vs multiple imputation for key models).
- **Multiplicity:** For exploratory analyses, report unadjusted p-values and consider False Discovery Rate (FDR) or Bonferroni for a subset of “primary exploratory” tests.
- **Software:** R (e.g. lm, aov, cor.test, wilcox.test) or Python (scipy, statsmodels, pingouin); or use existing app/StatisticalAnalysis pipeline extended with demographic predictors.

---

## 6. App implementation (Statistical Analysis page)

- **Demographics × Outcomes** tab: Uses Prolific demographics (including `raw_columns` from CSV: Telemedicine, Hearing difficulties, Speech disorders, Depression, Mental health diagnosis, Ai chatbots, Harmful content). For each predictor × outcome pair with n ≥ 5: **Age** → Spearman ρ and p; **categorical** → group comparison (Welch t-test if 2 groups, one-way ANOVA if 3+), p and Cohen’s d or η². Results table is sorted by p; cells with p &lt; 0.05 are highlighted. Upload the Prolific CSV in the Responses tab so `raw_columns` is populated.

## 7. Summary table (to fill in)

| Predictor | Outcomes to test | Main analysis | Moderation (condition × predictor) |
|-----------|------------------|---------------|-------------------------------------|
| Age | All | Correlation; regression | Yes |
| Sex / Gender | All | t-test / ANOVA | Yes |
| Ethnicity | All | ANOVA / Kruskal–Wallis | If n allows |
| Telemedicine | All | t-test | Yes |
| Hearing difficulties | All | t-test | If n allows |
| Speech disorders | All | t-test | If n allows |
| Depression | All | t-test | If n allows |
| Mental health diagnosis | All | t-test | If n allows |
| Ai chatbots | All | t-test (None vs Any) | Yes |
| Harmful content | All | t-test | Optional |
| Employment status | All | ANOVA | Optional |
| Student status | All | t-test | Optional |
| Time taken | All | Correlation / regression | Covariate in models |

Use this plan to run analyses; then focus reporting and interpretation on effects that are sizable, precise (narrow CIs), and theoretically plausible.
