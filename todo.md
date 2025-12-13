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
- dynamic particles
- rigid bodies (MAJOR)

to improve:

- worldtexture rgba32f

* gas behaviour
* different materials friction/behaviour
  - exponential rather than linear - materials are too similar

bugs:

- !!! rapier particles sliding
- !!! ambient heat transfer with material only works one side (heat no cold)
- ! reset button
- !! ice should float

todo major:

- particle system (renderer)
- new modes (edit/play)
- new material (fire) and materials interaction (mix materials, corrode, burn)

- !! player inside rapier
- !! attach sprite to buildables
- !! attach buildables to buildable
- other rapier buildables ( joint and chains)
- other tools to apply force to rapier/force layer

todo minor

- force visualization
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
- camera stick to player

todo:

- play mode
  - better walking mode
  - ui (spells )
  - light sources and lighting
  - events (triggers)
  - story (popups, choices)
  - inventory
