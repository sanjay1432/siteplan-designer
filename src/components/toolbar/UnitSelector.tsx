import { useUnits } from "../../geometry/units/UnitContext";

type Choice="ft"|"m"|"mm";

/** Units shown everywhere: feet, metres or millimetres. */
export function UnitSelector(){
  const {unitSystem,displayFormat,setUnitSystem,setDisplayFormat}=useUnits();
  const current:Choice=unitSystem==="imperial"?"ft":displayFormat==="millimetres"?"mm":"m";
  const choose=(choice:Choice)=>{
    if(choice==="ft"){setUnitSystem("imperial");return;}
    setUnitSystem("metric");setDisplayFormat(choice==="mm"?"millimetres":"meters");
  };
  return <div className="flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-xs" role="radiogroup" aria-label="Display units">
    {([["ft","Feet"],["m","Metres"],["mm","Millimetres"]] as [Choice,string][]).map(([choice,title])=><button key={choice} type="button" role="radio" aria-checked={current===choice} aria-label={title} onClick={()=>choose(choice)} title={title} className={`rounded px-2 py-1 font-medium transition-colors ${current===choice?"bg-white text-slate-900 shadow-xs":"text-slate-500 hover:text-slate-900"}`}>{choice}</button>)}
  </div>;
}
