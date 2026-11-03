export const collection=(d,n)=>({n});export const query=(c)=>c;export const where=()=>({});export const onSnapshot=(q,cb)=>{setTimeout(()=>cb({docs:[]}),10);return()=>{}};
export const doc=()=>({});export const getDoc=async()=>({exists:()=>false,data:()=>({})});export const setDoc=async()=>{};
