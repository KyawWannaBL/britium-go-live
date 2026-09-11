import React,{useEffect,useState} from "react";

export type BritiumLang="en"|"mm";

export function getBritiumLang():BritiumLang{

return localStorage.getItem("be_lang")==="mm"
?"mm"
:"en";

}


export function translate(
lang:BritiumLang,
en:string,
mm?:string
){

return lang==="mm"
?
(mm || en)
:
en;

}


export default function LanguageToggle(){

const [lang,setLang]=useState<BritiumLang>(
getBritiumLang()
);


useEffect(()=>{

localStorage.setItem(
"be_lang",
lang
);

window.dispatchEvent(
new CustomEvent(
"be-language-change",
{
detail:{lang}
}
)
);

},[lang]);


return (

<div className="flex gap-2">

<button
onClick={()=>setLang("en")}
className={`
px-3 py-2 rounded-lg
${lang==="en"
?"bg-[#f6b84b] text-[#061524]"
:"bg-[#123456] text-white"}
`}
>
EN
</button>


<button
onClick={()=>setLang("mm")}
className={`
px-3 py-2 rounded-lg
${lang==="mm"
?"bg-[#f6b84b] text-[#061524]"
:"bg-[#123456] text-white"}
`}
>
MM
</button>

</div>

);

}
