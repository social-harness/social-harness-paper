# Agentic Societies Need a Social Harness

Tapan Chugh, Vidushi Singh, Krish Jain, Arvind Krishnamurthy, and Ratul Mahajan

University of Washington

[Paper](https://social-harness.org/papers/agentic-societies-need-a-social-harness.pdf) · [Blog](https://social-harness.org/blog/agentic-societies-need-a-social-harness/)

An agentic society is a collection of AI agents that coordinate autonomously
across trust boundaries, on behalf of different principals whose objectives may
only partially align. Our experiments show that even honest, competent agents
often fail to reach satisfactory outcomes with existing harnesses and messaging
primitives, and that faulty or malicious agents can stall collaboration,
influence outcomes, and pursue other harmful goals. We argue that agentic
societies need a **social harness** for inter-agent interactions, in addition to
each agent's personal harness.

This release contains the 600 meeting-scheduling runs reported in the paper's
experiments E1–E6, along with a trace viewer.

## Explore the traces

The viewer lets you browse the experiments and inspect each run's agent
conversations, personas, and calendars. To open it locally, run this command
from the directory containing this README:

```sh
python3 -m http.server 8000
```

Then open [localhost:8000](http://localhost:8000/).

## Released data

| Path | Contents |
| --- | --- |
| `runs/` | Experiment configurations and individual runs, including agent personas, principal inputs and recorded replies, message traces, initial and final calendars, answer keys, and grades. |
| `results.json` | Outcomes and message statistics for the released experiments. |
| `index.html` | Trace viewer; uses `index.json` to locate the runs. |

## Citation

If you use these artifacts, please cite:

> Tapan Chugh, Vidushi Singh, Krish Jain, Arvind Krishnamurthy, and Ratul Mahajan.
> *Agentic Societies Need a Social Harness*. 2026.

## License

This repository is released under the [MIT License](https://opensource.org/license/mit).
