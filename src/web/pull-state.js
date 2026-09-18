(function(root){
  function createPullState(threshold=150){
    let distance=0,triggering=false;
    const snapshot=()=>({distance,armed:distance>=threshold,triggering});
    return {
      pull(amount,{atBottom,busy}={}){
        if(!atBottom||busy||triggering)return snapshot();
        distance=Math.min(threshold,Math.max(0,amount));
        return snapshot();
      },
      release({busy}={}){
        if(busy||triggering||distance<threshold){distance=0;return {trigger:false,...snapshot()}}
        triggering=true;
        return {trigger:true,...snapshot()};
      },
      reset(){distance=0;triggering=false;return snapshot()},
      snapshot
    };
  }
  const api={createPullState};
  if(typeof module!=="undefined")module.exports=api;
  root.GongkaoPull=api;
})(typeof window!=="undefined"?window:globalThis);

