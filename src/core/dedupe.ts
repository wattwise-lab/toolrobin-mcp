// ToolRobin core copied from src/tools/text/dedupe-core.ts; see PROVENANCE.json.
export function dedupeLines(input:string,options:{ignoreCase:boolean;trim:boolean;removeBlank:boolean}){
 if(!input.trim())throw new Error('Enter some lines first.');
 if(input.length>100000)throw new Error('Use no more than 100,000 characters.');
 const lines=input.replace(/\r\n?/g,'\n').split('\n');const seen=new Set<string>(),kept:string[]=[];
 for(const line of lines){if(options.removeBlank&&!line.trim())continue;let key=options.trim?line.trim():line;if(options.ignoreCase)key=key.toLowerCase();if(!seen.has(key)){seen.add(key);kept.push(line);}}
 return {output:kept.join('\n'),before:lines.length,after:kept.length};
}
