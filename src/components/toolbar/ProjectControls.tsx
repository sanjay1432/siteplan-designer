import { useRef, useState } from "react";
import { Download, FolderPlus, Pencil, Trash2, Upload } from "lucide-react";
import { usePlot } from "../../geometry/plot/PlotContext";
import { exportProjectJson } from "../../lib/sitePlanExport";

export function ProjectControls() {
  const { projects, activeProjectId, activeProjectName, switchProject, createProject, renameProject, deleteProject, exportProject, importProject } = usePlot();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice,setNotice]=useState("");

  async function importFile(file?:File) {
    if(!file)return;
    try {
      const value:unknown=JSON.parse(await file.text());
      if(!importProject(value))throw new Error("This file is not a supported SitePlan project.");
      setNotice("Project imported.");
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Could not read this file.");
    }
    if(fileRef.current)fileRef.current.value="";
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <label className="sr-only" htmlFor="project-picker">Active project</label>
    <select id="project-picker" value={activeProjectId} onChange={event=>switchProject(event.target.value)} className="max-w-40 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">
      {projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <button type="button" onClick={createProject} title="Create a new project" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><FolderPlus className="size-3.5"/><span className="hidden sm:inline">New</span></button>
    <button type="button" onClick={()=>{const next=window.prompt("Project name",activeProjectName);if(next)renameProject(next);}} title="Rename project" className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Rename project"><Pencil className="size-3.5"/></button>
    <button type="button" onClick={()=>{if(window.confirm(`Delete “${activeProjectName}”?`))deleteProject();}} title="Delete project" className="inline-flex items-center rounded-md border border-slate-200 bg-white p-1.5 text-red-600 hover:bg-red-50" aria-label="Delete project"><Trash2 className="size-3.5"/></button>
    <button type="button" onClick={()=>exportProjectJson(activeProjectName,exportProject())} title="Download editable project backup" className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700"><Download className="size-3.5"/><span className="hidden sm:inline">Export</span></button>
    <button type="button" onClick={()=>fileRef.current?.click()} title="Import a SitePlan project JSON file" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Upload className="size-3.5"/><span className="hidden sm:inline">Import</span></button>
    <input ref={fileRef} type="file" accept=".json,.siteplan.json,application/json" className="hidden" onChange={event=>void importFile(event.target.files?.[0])}/>
    {notice && <span role="status" className="max-w-48 text-[10px] text-slate-500">{notice}</span>}
  </div>;
}
