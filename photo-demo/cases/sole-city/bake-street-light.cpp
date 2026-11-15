// Offline sky-visibility bake: compile with c++ -O3 -std=c++17; arguments are
// the capture-street-mesh.cjs triangle file and the output RGB atlas (PPM).
// Splat conservatively on each triangle's major projection, then march rays on
// the resulting solid shell. Actual openings, balconies and thin awnings survive.
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <vector>
#include <thread>
#include <atomic>
#include <cassert>
struct V{float x,y,z; float operator[](int i)const{return i==0?x:i==1?y:z;}};
V sub(V a,V b){return {a.x-b.x,a.y-b.y,a.z-b.z};} V cross(V a,V b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
#ifdef CITY_LIGHT
constexpr float vx=-.58f,vy=-.012f,vz=-1.12f,h=.004f;
constexpr int nx=290,ny=190,nz=560;
#else
constexpr float vx=-.32f,vy=-.006f,vz=-.060f,h=.0015f; constexpr int nx=438,ny=335,nz=392;
#endif
std::vector<unsigned char> vox(size_t(nx)*ny*nz);int sizeAt(int k){return k==0?nx:k==1?ny:nz;}
void insert(V a,V b,V c){
  const V n=cross(sub(b,a),sub(c,a));int k=0;for(int j=1;j<3;j++)if(std::abs(n[j])>std::abs(n[k]))k=j;
  if(std::abs(n[k])<1e-8f)return;int u=(k+1)%3,v=(k+2)%3;
  int loU=std::max(0,int(std::floor(std::min({a[u],b[u],c[u]})))),hiU=std::min(sizeAt(u)-1,int(std::floor(std::max({a[u],b[u],c[u]}))));
  int loV=std::max(0,int(std::floor(std::min({a[v],b[v],c[v]})))),hiV=std::min(sizeAt(v)-1,int(std::floor(std::max({a[v],b[v],c[v]}))));
  for(int j=loV;j<=hiV;j++)for(int i=loU;i<=hiU;i++){
    // Test projected triangle against the cell square, not just its center.
    bool ok=true;V pts[3]={a,b,c};for(int l=0;l<3;l++){V p=pts[l],q=pts[(l+1)%3];float du=q[u]-p[u],dv=q[v]-p[v];float edge=du*((j+.5f)-p[v])-dv*((i+.5f)-p[u]); if((n[k]>0?edge:-edge)<-.501f*(std::abs(du)+std::abs(dv))){ok=false;break;}}
    if(!ok)continue;
    float d=a[k]-(n[u]*(i+.5f-a[u])+n[v]*(j+.5f-a[v]))/n[k];int mb=int(std::floor(d));
    if(mb<0||mb>=sizeAt(k))continue;int p[3];p[k]=mb;p[u]=i;p[v]=j;vox[(p[2]*ny+p[1])*nx+p[0]]=1;
  }
}
#ifdef CITY_LIGHT
constexpr int W=92,H=33,D=196,columns=7;
constexpr V low={-.44f,.001f,-1.014f},high={.44f,.53f,1.014f};
constexpr float heightPower=1.6f;
#else
constexpr int columns=1;constexpr float heightPower=1.f;
constexpr int W=106,H=29,D=66;constexpr V low={-.217f,.001f,.083f},high={.261f,.125f,.367f};
#endif
struct Ray{V v;float weights[5];};std::array<Ray,64> rays;
int main(int argc,char**argv){assert(argc==3);FILE*f=fopen(argv[1],"rb");assert(f);V verts[3];while(fread(verts,sizeof(V),3,f)==3){for(auto& p:verts)p={(p.x-vx)/h,(p.y-vy)/h,(p.z-vz)/h};insert(verts[0],verts[1],verts[2]);}fclose(f);
  float norms[5]={};for(int i=0;i<int(rays.size());i++){float y=(i+.5f)/rays.size(),r=std::sqrt(1-y*y),a=2.39996323f*i+.28f;V v={r*std::cos(a),y,r*std::sin(a)};Ray& ray=rays[i];ray.v=v;float s[5]={v.x,-v.x,v.y,v.z,-v.z};for(int k=0;k<5;k++){ray.weights[k]=std::max(0.f,s[k]);norms[k]+=ray.weights[k];}}
  // Two adjacent RGB slabs for each Z slice; no lossy colour conversion.
  std::vector<unsigned char> out(2*W*columns*H*((D+columns-1)/columns)*3);std::atomic_int row(0);auto work=[&](){for(;;){int layer=row++;if(layer>=H*D)break;int y=layer%H,z=layer/H;
    for(int x=0;x<W;x++){
      float vertical=std::pow(float(y)/(H-1),heightPower);
      float fx=((low.x+(high.x-low.x)*x/(W-1))-vx)/h,fy=((low.y+(high.y-low.y)*vertical)-vy)/h,fz=((low.z+(high.z-low.z)*z/(D-1))-vz)/h;
      float totals[5]={},near=0;
      for(const auto& ray:rays){V v=ray.v;int ix=int(fx),iy=int(fy),iz=int(fz);int sx=v.x<0?-1:1,sz=v.z<0?-1:1;
        float dx=1/(std::abs(v.x)+1e-9f),dy=1/v.y,dz=1/(std::abs(v.z)+1e-9f),tx=(v.x<0?fx-ix:ix+1-fx)*dx,ty=(iy+1-fy)*dy,tz=(v.z<0?fz-iz:iz+1-fz)*dz;float d=0;
        while(ix>=0&&ix<nx&&iy<ny&&iz>=0&&iz<nz){if(d>1.f&&vox[(iz*ny+iy)*nx+ix])break;if(tx<ty&&tx<tz){ix+=sx;d=tx;tx+=dx;}else if(ty<tz){iy++;d=ty;ty+=dy;}else{iz+=sz;d=tz;tz+=dz;}}
        const bool clear=ix<0||ix>=nx||iy>=ny||iz<0||iz>=nz;
        for(int k=0;k<5;k++)totals[k]+=ray.weights[k]*(clear?1.f:0.f);
        // Short-range accessibility is kept separately from the long sky paths:
        // light bounced from nearby plaster and road survives in deep canopies.
        near+=clear?1.f:std::min(1.f,d*h/.040f);
      }
      int a=(((z/columns)*H+y)*2*W*columns+(z%columns)*2*W+x)*3,b=a+W*3;float values[6]={totals[0]/norms[0],totals[1]/norms[1],totals[2]/norms[2],totals[3]/norms[3],totals[4]/norms[4],near/rays.size()};
      for(int i=0;i<6;i++)out[(i<3?a:b)+(i%3)]=std::lround(std::clamp(values[i],0.f,1.f)*255);
    }} };
  std::vector<std::thread> workers;for(int i=0;i<8;i++)workers.emplace_back(work);for(auto&t:workers)t.join();
  f=fopen(argv[2],"wb");assert(f);fprintf(f,"P6\n%d %d\n255\n",2*W*columns,H*((D+columns-1)/columns));fwrite(out.data(),1,out.size(),f);fclose(f);
}
