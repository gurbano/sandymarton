player/buildables/sources add force to force field

in a shader,
particles that are below the force field gets replaced with an empty cell, and added to a new array (texture) of dynamic particles

a shader loop over this array and simulate the force

the dynamic particle should calculate trajectory according to force (and gravity and friction)
the dynamic particle should then move following this trajectory
the dynamic particle has a max pixel traversed per cycle (configurable) that obv depends on the speed.
the dynamic particle should move through empty spaces and gas until it hits a particle

when it hits a particle (in the world texture)

- if static, should bounce and keep moving
- if solid or liquid, the other particle has a chance (based on the speed of the impact) to become a dynamic particle too, and the the first dynamic particle should tramsfer half of its momentum to the 2nd particle (simulate inertia)

the dynamic particle should be removed from the array and readded to the world texture if horizontal and vertical speed falls below a certain threshold.
