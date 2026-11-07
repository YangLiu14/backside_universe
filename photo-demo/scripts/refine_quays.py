"""Surveyed beach steps and mooring fittings in the original Y-up model frames."""
import math
from mathutils import Vector
from miniature_joinery import Part, material

V=Vector
UP=V((0,1,0))


def beach_steps():
    terracotta=Part("Harbor | fired brick",material("Ocher fired clay",(173,123,92),.92,clay=True))
    light=Part("Harbor | sun-washed tiles",material("Pale terra cotta",(191,146,109),.94,clay=True))
    # Fit the old block staircase between the tideline and the blue cottage.
    # The survey includes the low break of slope at the fourth course.
    profile=[(.265,-.273),(.240,-.264),(.211,-.255),(.180,-.250),(.161,-.232),
             (.139,-.215),(.118,-.214),(.105,-.198),(.087,-.197),(.067,-.180),
             (.050,-.162),(.032,-.147),(.012,-.146)]
    def ground(z):
        for (a,u),(b,v) in zip(profile,profile[1:]):
            if z>=b:return u+(v-u)*min(1,max(0,(a-z)/(a-b)))
        return profile[-1][1]
    width=.092
    for i in range(19):
        z=.257-i*.0130
        # A battered riser extends down into the one below. Tile seams
        # run in alternate bonds, and both side cheeks are solid clay.
        h=ground(z-.0065)+.005
        bonds=[0,.30,.68,1] if i%2 else [0,.19,.54,.83,1]
        for j,(a,b) in enumerate(zip(bonds,bonds[1:])):
            part=light if (i*3+j)%7 in (0,4) else terracotta
            left=-.04+(a-.5)*width+.0003;right=-.04+(b-.5)*width-.0003
            part.beam(V((left,h-.006,z)),V((right,h-.006,z)),.012,.01285,UP)
        for side in [-1,1]:
            x=-.04+side*(width/2+.002)
            light.beam(V((x,h-.002,z-.0065)),V((x,h-.002,z+.0065)),.013,.0044,UP)
    for part in [terracotta,light]:part.finish()


def moorings(asset):
    # The blue cliff's long pier runs in a different direction to the handset quay.
    placements={'blue-book':[(.18716,.05628,-.07148),(.280,.0526,-.014)],
                'phone':[(-.06552,.05997,-.05424)]}
    grain=Part("Quay | hardwood blocks",material("Oiled teak",(123,91,61),.82,grain=True))
    bronze=Part("Quay | bronze horns and bolts",material("Salt-worn bronze",(129,112,84),.46,.58))
    rope=Part("Quay | laid hemp",material("Tarred flax",(147,126,86),.94))
    axis=V((.87,0,.49)) if asset=='blue-book' else V((.62,0,-.78))
    side=axis.cross(UP)
    for xyz in placements[asset]:
        p=V(xyz)
        def at(w,h,d):return p+side*w+UP*h+axis*d
        grain.beam(at(0,.0014,-.014),at(0,.0014,.014),.0032,.010,UP)
        bronze.beam(at(0,.0031,-.009),at(0,.0031,.009),.0017,.0068,UP)
        for sign in [-1,1]:
            bronze.twig(at(0,.0036,sign*.004),at(0,.009,sign*.006),.0022,.0018,9)
            bronze.twig(at(0,.0085,sign*.005),at(0,.0098,sign*.014),.0023,.0011,10)
            for w in [-.0022,.0022]:
                bronze.twig(at(w,.0033,sign*.0074),at(w,.0043,sign*.0074),.00084,.00085,6)
        # The eye is wound around the feet of the cleat; the working end
        # lies on the block instead of trailing across the walking surface.
        last=None
        for i in range(77):
            a=i*math.tau/32
            q=at(.0032*math.sin(2*a),.0044+i*.000019,.0072*math.cos(a))
            if last is not None:rope.twig(last,q,.00067,.00067,6)
            last=q
        rope.twig(last,at(-.0038,.0032,.012),.00067,.0005,6)
    for part in [grain,bronze,rope]:part.finish()
