done

- floating and layering
- liquid density swap
- solid/liquid materials interaction (float and sink)
- ui fps/particle count
- temperature, force, etc overlays
- state change (evaporation, sublimation)
- new renderer
  - bloom
  - texture
- build mode
- heat/cool sources
- particle sources/sinks

to improve:

- worldtexture rgba32f

* gas behaviour
* different materials friction/behaviour
  - exponential rather than linear - materials are too similar

bugs:

- reset button
- ice should float
- ambient heat transfer with material only works one side (heat no cold)

todo major:

- new modes (edit/play)
- dynamic particles
- particle system (renderer)
- new material (fire) and materials interaction (mix materials, corrode, burn)
- rigid bodies

todo minor:

- rewrite claude.md
- add visual and controls to heater/sources/buildables
- draw heater/cooler
- Diagonal and vertical liquid pressure model.
- background

PLAYER MODE
done:

- basic movement & controls
- basic particle2player interaction (particles push player)
- basic renderer

todo:

- play mode
  - camera stick to player
  - better walking mode
  - ui (spells )
  - light sources and lighting
  - events (triggers)
  - story (popups, choices)
  - inventory
