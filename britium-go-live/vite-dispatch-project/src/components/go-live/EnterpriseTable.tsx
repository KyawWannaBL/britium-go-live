import React from "react";

export default function EnterpriseTable({
headers,
children,
}:{
headers:string[];
children:React.ReactNode;
}){

return (

<div className="
overflow-x-auto
rounded-3xl
border
border-[#1a3a5c]
bg-[#0b2236]
">

<table className="w-full text-sm">

<thead>

<tr className="bg-[#f6b84b] text-[#061524]">

{headers.map((h)=>(
<th
key={h}
className="
px-4
py-3
text-left
font-black
uppercase
"
>
{h}
</th>
))}

</tr>

</thead>


<tbody className="
divide-y
divide-[#1a3a5c]
text-[#eef8ff]
">

{children}

</tbody>


</table>

</div>

);

}
