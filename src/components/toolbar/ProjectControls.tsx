import { useEffect, useRef, useState } from "react";
import { FolderPlus, MoreHorizontal, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";

export function ProjectControls(){
  const {projects,activeProjectId,activeProjectName,switchProject,createProject,renameProject,deleteProject,canUndo,canRedo,undo,redo}=usePlot();
  const [menuOpen,setMenuOpen]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!menuOpen)return;
    const close=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);};
    window.addEventListener("pointerdown",close);
    return ()=>window.removeEventListener("pointerdown",close);
  },[menuOpen]);
  const icon="inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-35 disabled:hover:bg-transparent";

  return <div className="flex min-w-0 items-center gap-1">
    <label className="sr-only" htmlFor="project-picker">Active project</label>
    <select id="project-picker" value={activeProjectId} onChange={event=>switchProject(event.target.value)} title="Switch project" className="max-w-44 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800">
      {projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <button type="button" onClick={createProject} title="New project" aria-label="New project" className={icon}><FolderPlus className="size-4"/></button>
    <div ref={menuRef} className="relative">
      <button type="button" onClick={()=>setMenuOpen(value=>!value)} aria-haspopup="menu" aria-expanded={menuOpen} title="Project options" aria-label="Project options" className={icon}><MoreHorizontal className="size-4"/></button>
      {menuOpen&&<div role="menu" className="absolute left-0 top-8 z-50 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
        <button type="button" role="menuitem" onClick={()=>{setMenuOpen(false);const next=window.prompt("Project name",activeProjectName);if(next?.trim())renameProject(next.trim());}} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"><Pencil className="size-3.5"/>Rename project</button>
        <button type="button" role="menuitem" onClick={()=>{setMenuOpen(false);if(window.confirm(`Delete “${activeProjectName}”? This cannot be undone.`))deleteProject();}} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"><Trash2 className="size-3.5"/>Delete project</button>
      </div>}
    </div>
    <span className="mx-1 h-4 w-px bg-slate-200"/>
    <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className={icon}><Undo2 className="size-4"/></button>
    <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo" className={icon}><Redo2 className="size-4"/></button>
  </div>;
}
