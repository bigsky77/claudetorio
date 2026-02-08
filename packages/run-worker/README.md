# RUN WORKER

Autonomously create a run through a LLM API.


## NOTES
- the default `api_factory.acall` fl behavior is to retry infinitely upon failure with no logs, we mitigate this issue by overloading the function.