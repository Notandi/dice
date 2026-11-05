# Physics determines roll results

A Face Value is whatever face the simulated Die comes to rest on. We do not pick the number with a random number generator first and then steer the animation to match it. We chose this so every Roll is an honest physical throw, the same as at a real table, and the player can fling the dice themselves.

## Consequences

- Rolls can't be reproduced or replayed from a seed, so tests for reading faces must place dice in known orientations instead of throwing them.
- Dice can land Cocked, so the app needs a way to resolve that (see GLOSSARY: Cocked).
- A future shared table can't just send numbers between players: it would have to sync the simulation, or have one client act as the authority.
