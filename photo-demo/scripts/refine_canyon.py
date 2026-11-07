"""Local joinery and olive canopy, surveyed on the orange book's Y-up Tripo mesh."""
import math
import random

import bmesh
from mathutils import Vector
from miniature_joinery import Part, material

V = Vector
UP = V((0, 1, 0))
WINDOW = V((.1490, .2750, .2740))
ALONG = V((.235, 0, .972)).normalized()
OUT = V((-ALONG.z, 0, ALONG.x))


def remove_fused_details(obj):
    bm=bmesh.new(); bm.from_mesh(obj.data)
    cut=[]
    for f in bm.faces:
        c=f.calc_center_median(); x,y,z=c.x,c.z,-c.y
        if not (-.10<x<.18 and .04<z<.34 and .17<y<.31): continue
        delta=V((x,y,z))-WINDOW
        window=abs(delta.dot(ALONG))<.018 and abs(delta.y)<.018 and abs(delta.dot(OUT))<.017
        crown=.058<x<.134 and .246<z<.326 and .2154<y<.252
        bridge=-.089<x<.113 and .051<z-.175*x<.112 and .180<y<.209
        if window or crown or bridge: cut.append(f)
    bmesh.ops.delete(bm,geom=cut,context='FACES')
    bm.to_mesh(obj.data);bm.free();obj.data.update()


def refine_canyon(obj):
    remove_fused_details(obj)
    oak=Part("Canyon | oiled timber",material("Sun-bleached cedar",(144,103,65),.81,grain=True))
    dark=Part("Canyon | cut ends and braces",material("Heartwood",(97,69,45),.86,grain=True))
    green=Part("Inn | shutter joinery",material("Faded juniper paint",(84,115,99),.80,grain=True))
    stone=Part("Inn | dressed sill",material("Cut pink limestone",(204,168,128),.92))
    iron=Part("Canyon | pegs and straps",material("Forged bronze",(88,73,54),.50,.55))
    glass=Part("Inn | recessed casement",material("Smoky window glass",(62,83,82),.23,.17))
    def wall(u,v,d):
        return WINDOW+u*ALONG+v*UP+d*OUT
    def rail(part,u,v,U,Y,d,w,h,side=UP):
        part.beam(wall(u,v,d),wall(U,Y,d),w,h,side)
    # Full jamb returns surround a pane behind the plaster plane.
    for u in [-.019,.019]:
        rail(oak,u,-.019,u,.020,.0008,.0038,.009,ALONG)
    for v in [-.0185,.019]:
        rail(oak,-.021,v,.021,v,.0008,.0030,.009)
    rail(stone,-.037,-.021,.037,-.021,.0033,.0036,.016)
    rail(stone,-.0235,.0225,.0235,.0225,.0005,.0035,.010)
    glass.beam(wall(-.0183,0,-.0037),wall(.0183,0,-.0037),.036,.001,UP)
    rail(dark,0,-.018,0,.018,-.0018,.0015,.0025,ALONG)
    rail(dark,-.018,.002,.018,.002,-.0018,.0015,.0025)
    for sign in [-1,1]:
        mid=sign*.027
        for u in [mid-.007,mid+.007]:
            rail(green,u,-.017,u,.018,.0035,.0022,.004,ALONG)
        for v in [-.0175,.018]:
            rail(green,mid-.008,v,mid+.008,v,.0035,.0025,.0045)
        for k in range(9):
            rail(green,mid-.0066,-.014+ k*.00365,mid+.0066,-.014+k*.00365,.004,.0038,.0015,(UP+OUT*.52).normalized())
        for v in [-.011,.012]:
            rail(iron,mid-sign*.0078,v,mid-sign*.0012,v,.006,.0012,.0008)
            iron.twig(wall(mid-sign*.0075,v-.0019,.0062),wall(mid-sign*.0075,v+.0019,.0062),.00085,.00085)
    # Re-deck the crossing. Three physical stair treads at the east landing
    # meet the existing rising path. Both handrails are seated on the stringers.
    def bridge(x,y,offset=0):
        return V((x,y,.082+.175*x+offset))
    width=V((-.175,0,1)).normalized()
    for edge in [-.020,.020]:
        dark.beam(bridge(-.091,.175,edge),bridge(.114,.175,edge),.006,.005)
    for i in range(26):
        x=-.09+(i+.5)*.0079
        level=.180+min(3,max(0,i-21))*.0035
        oak.beam(bridge(x,level-.00145,-.026),bridge(x,level-.00145,.026),.0029,.00772,UP)
    for edge in [-.024,.024]:
        posts=[-.088,-.047,-.006,.035,.076,.112]
        for i,x in enumerate(posts):
            lift=.0105 if i==len(posts)-1 else 0
            base=bridge(x,.175,edge)
            oak.beam(base,bridge(x,.205+lift,edge),.0049,.0049,width)
            for h in [.187,.201]:
                head=bridge(x,h+lift,edge)+width*math.copysign(.0032,edge)
                iron.twig(head-width*math.copysign(.0018,edge),head+.0005*width*math.copysign(1,edge),.00085,.00090,9)
            if i:
                prev=posts[i-1]
                for part,h,w,t in [(oak,.202,.003,.0043),(dark,.188,.0024,.0026)]:
                    part.beam(bridge(prev,h,edge),bridge(x,h+lift,edge),w,t,UP)
                dark.beam(bridge(prev+.001,.178,edge),bridge(prev+.012,.188,edge),.0024,.0024)
    # An open, coastal olive. Keep the surveyed trunk, and grow each spray
    # from a fork. Folded leaves catch light on their ridge and have real gaps.
    rng=random.Random(7712)
    bark=Part("Inn | olive branches",material("Weathered olive bark",(111,94,66),.9))
    greens=[(67,86,48),(95,111,57),(124,139,79),(147,155,99)]
    leaves=[Part("Inn | olive foliage "+str(i),material("Olive leaf "+str(i),rgb,.76)) for i,rgb in enumerate(greens)]
    for part in leaves: part.mat.use_backface_culling=False
    root=V((.097,.210,.289))
    for i in range(10):
        a=i*math.tau/10+rng.uniform(-.2,.2)
        radial=V((math.cos(a),0,math.sin(a)))
        fork=root+radial*rng.uniform(.007,.015)+UP*rng.uniform(.011,.019)
        bark.twig(root,fork,.0026,.00155)
        for j in range(5):
            theta=a+rng.uniform(-.73,.73)
            direction=V((math.cos(theta),0,math.sin(theta)))
            reach=rng.uniform(.015,.029)
            tip=fork+direction*reach+UP*rng.uniform(.002,.016)
            bend=fork.lerp(tip,.5)+UP*.002
            bark.twig(fork,bend,.0015,.00085);bark.twig(bend,tip,.00085,.00035)
            for k in range(5):
                start=bend.lerp(tip,k/5)
                az=theta+(-1 if k%2 else 1)*rng.uniform(.4,1.55)
                twig=V((math.cos(az)*.008,rng.uniform(.002,.008),math.sin(az)*.008))
                bark.twig(start,start+twig,.00048,.00018,5)
                for n in range(5):
                    stem=start+twig*(n+.5)/5
                    for sign in [-1,1]:
                        ang=az+sign*rng.uniform(.4,1.35)
                        length=rng.uniform(.004,.0074)
                        end=stem+V((math.cos(ang)*length,rng.uniform(-.002,.0035),math.sin(ang)*length))
                        half=V((-math.sin(ang),0,math.cos(ang)))*rng.uniform(.0008,.00125)
                        mid=stem.lerp(end,.48)
                        ridge=mid+UP*.00065
                        part=rng.choices(leaves,[2,4,3,1])[0]
                        for f in [[stem,mid+half,ridge],[mid+half,end,ridge],[end,mid-half,ridge],[mid-half,stem,ridge]]:part.face(f)
    for part in [oak,dark,green,stone,iron,glass,bark,*leaves]:part.finish()
