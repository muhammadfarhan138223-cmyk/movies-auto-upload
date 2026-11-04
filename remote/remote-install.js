'use strict';
if('serviceWorker' in navigator && window.isSecureContext){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/remote-sw.js',{scope:'/'}).catch(()=>{});
  });
}
