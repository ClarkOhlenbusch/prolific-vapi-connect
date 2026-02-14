# Future Features / Plans

allow downloading audio files and send to cerine.

Now that we're going to push the updated change for the status in which "Completed" is shown when status is submitted, how should we change previous ones in which, because of the migration, the accidental not redeployed super base functions? How should we go about those previous ones? Maybe just manually with an SQL query, mark all those from batch main_2 as completed, or should I give you the prolific ids for those just in case to keep it safe? actually i just checked and there are no main_2 participants labelled as pending on UI on prod, which means its fine to just go back and autosubmit for them, probably best to use a relevant date/timestamp for them so the order still appears correctly right? come up with a plan first

button on feedback should be continue not submit

add adjusted p value to progression bar

i uploaded transcripts and it said 140 or so matched, but the f-score on stat dashboard and responses doesnt seem to have been updated

session replay is black (but shows moving mouse) on localhost, but it works on prod

I want to be able to choose the batch scope for balance for different batches and then click Rebalance from then on so that it automatically sets the condition offset for the next ones. 
And I want the condition counter to be kind of based off of that, instead of being based on the global counter, if that makes sense. Does that make sense? Help come up with a plan for this first and ask me before you continue. i just want an easy way to make sure that its balanced.

Stats: keep submitted-only by default; add an optional "Include drafts" toggle (OFF by default) that warns sample sizes vary and shows per-metric n (e.g. n_pets/n_tias/n_feedback).

main 2 (new batch) is not appearing on all batches, also the alternating assignment how does that wor?

when filtering by batch, pending is not shown even when all status or pending is fitlered, on all responses

it didnt work on mozilla?

researcher notes, show toast that it saved


the session replay starts playing but once I try to drag and drop or drag it, it kind of breaks. 

index-jBPe9MVo.js:2 media playback error AbortError: The play() request was interrupted because the media was removed from the document. https://goo.gl/LdLk22
(anonymous) @ index-jBPe9MVo.js:2
Promise.catch
S @ index-jBPe9MVo.js:2
ci @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
fi @ index-jBPe9MVo.js:2
rebuildFullSnapshot @ index-jBPe9MVo.js:30
c @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
Er.applyEventsSynchronously @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
rt @ index-jBPe9MVo.js:30
send @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
pause @ index-jBPe9MVo.js:30
pe @ ResponseDetails-BkeK6jEX.js:51
onChange @ ResponseDetails-BkeK6jEX.js:51
b_ @ index-DTGNOgU0.js:38
x_ @ index-DTGNOgU0.js:38
S_ @ index-DTGNOgU0.js:38
fh @ index-DTGNOgU0.js:38
jg @ index-DTGNOgU0.js:38
(anonymous) @ index-DTGNOgU0.js:38
Kd @ index-DTGNOgU0.js:41
rg @ index-DTGNOgU0.js:38
iu @ index-DTGNOgU0.js:38
bd @ index-DTGNOgU0.js:38
F_ @ index-DTGNOgU0.js:38Understand this warning
index-DTGNOgU0.js:38 Uncaught TypeError: Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'.
    at Er.insertStyleRules (index-jBPe9MVo.js:30:20178)
    at Er.rebuildFullSnapshot (index-jBPe9MVo.js:30:19494)
    at c (index-jBPe9MVo.js:30:10488)
    at index-jBPe9MVo.js:30:11316
    at Er.applyEventsSynchronously (index-jBPe9MVo.js:30:9925)
    at play (index-jBPe9MVo.js:30:4866)
    at index-jBPe9MVo.js:30:2667
    at Array.forEach (<anonymous>)
    at rt (index-jBPe9MVo.js:30:2624)
    at Object.send (index-jBPe9MVo.js:30:2815)
insertStyleRules @ index-jBPe9MVo.js:30
rebuildFullSnapshot @ index-jBPe9MVo.js:30
c @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
Er.applyEventsSynchronously @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
rt @ index-jBPe9MVo.js:30
send @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
pause @ index-jBPe9MVo.js:30
pe @ ResponseDetails-BkeK6jEX.js:51
onChange @ ResponseDetails-BkeK6jEX.js:51
b_ @ index-DTGNOgU0.js:38
x_ @ index-DTGNOgU0.js:38
S_ @ index-DTGNOgU0.js:38
fh @ index-DTGNOgU0.js:38
jg @ index-DTGNOgU0.js:38
(anonymous) @ index-DTGNOgU0.js:38
Kd @ index-DTGNOgU0.js:41
rg @ index-DTGNOgU0.js:38
iu @ index-DTGNOgU0.js:38
bd @ index-DTGNOgU0.js:38
F_ @ index-DTGNOgU0.js:38Understand this error
index-jBPe9MVo.js:2 media playback error AbortError: The play() request was interrupted because the media was removed from the document. https://goo.gl/LdLk22
(anonymous) @ index-jBPe9MVo.js:2
Promise.catch
S @ index-jBPe9MVo.js:2
ci @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
he @ index-jBPe9MVo.js:2
fi @ index-jBPe9MVo.js:2
rebuildFullSnapshot @ index-jBPe9MVo.js:30
c @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
Er.applyEventsSynchronously @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
(anonymous) @ index-jBPe9MVo.js:30
rt @ index-jBPe9MVo.js:30
send @ index-jBPe9MVo.js:30
play @ index-jBPe9MVo.js:30
pause @ index-jBPe9MVo.js:30
pe @ ResponseDetails-BkeK6jEX.js:51
onChange @ ResponseDetails-BkeK6jEX.js:51
b_ @ index-DTGNOgU0.js:38
x_ @ index-DTGNOgU0.js:38
S_ @ index-DTGNOgU0.js:38
fh @ index-DTGNOgU0.js:38
jg @ index-DTGNOgU0.js:38
(anonymous) @ index-DTGNOgU0.js:38
Kd @ index-DTGNOgU0.js:41
rg @ index-DTGNOgU0.js:38
iu @ index-DTGNOgU0.js:38
bd @ index-DTGNOgU0.js:38
F_ @ index-DTGNOgU0.js:38Understand this warning
14index-DTGNOgU0.js:38 Uncaught TypeError: Failed to execute 'insertBefore' on 'Node': parameter 1 is not of type 'Node'.
    at Er.insertStyleRules (index-jBPe9MVo.js:30:20178)
    at Er.rebuildFullSnapshot (index-jBPe9MVo.js:30:19494)
    at c (index-jBPe9MVo.js:30:10488)
    at index-jBPe9MVo.js:30:11316
    at Er.applyEventsSynchronously (index-jBPe9MVo.js:30:9925)
    at play (index-jBPe9MVo.js:30:4866)
    at index-jBPe9MVo.js:30:2667
    at Array.forEach (<anonymous>)
    at rt (index-jBPe9MVo.js:30:2624)
    at Object.send (index-jBPe9MVo.js:30:2815)





## Statistical Analysis: Batch Filtering

- Goal: allow filtering Statistical Analysis results by one or more `batch_label` values (and optionally “No batch”), similar to the batch selectors on Summary/Experiment Settings.
- Proposed UX: add a Batch multi-select (default: All batches) near the existing Source filter; selection should persist in `sessionStorage` like the Source filter does.
- Likely impact: `src/pages/StatisticalAnalysis.tsx` (query + filtering + UI control), possibly shared batch-option fetch helper (from `experiment_batches`) to keep lists consistent across pages.
