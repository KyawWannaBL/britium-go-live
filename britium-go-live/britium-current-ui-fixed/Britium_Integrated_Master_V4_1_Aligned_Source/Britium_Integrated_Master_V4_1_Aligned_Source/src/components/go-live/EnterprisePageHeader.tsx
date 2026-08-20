import React from "react";

export default function EnterprisePageHeader({
title,
subtitle,
children,
}:{
title:string;
subtitle?:string;
children?:React.ReactNode;
}){

return (

<div className="
rounded-3xl
border
border-[#1a3a5c]
bg-[#0b2236]
p-6
mb-6
flex
justify-between
items-start
gap-5
">

<div>

<div className="
text-[#f6b84b]
text-xs
font-black
uppercase
tracking-[0.3em]
">
BRITIUM EXPRESS
</div>


<h1 className="
text-3xl
font-black
text-white
mt-2
">
{title}
</h1>


{subtitle && (
<p className="
text-[#9fc4df]
mt-2
">
{subtitle}
</p>
)}

</div>


<div>
{children}
</div>


</div>

);

}
