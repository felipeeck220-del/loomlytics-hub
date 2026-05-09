 import { Loader2 } from 'lucide-react';
 
 interface LoadingScreenProps {
   progress: number;
   message?: string;
 }
 
 export default function LoadingScreen({ progress, message = "Carregando dados da empresa..." }: LoadingScreenProps) {
   return (
     <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6">
       <div className="w-full max-w-md space-y-6 text-center animate-in fade-in zoom-in duration-300">
         <div className="flex justify-center">
           <div className="relative">
             <Loader2 className="h-16 w-16 text-primary animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">
               {Math.round(progress)}%
             </div>
           </div>
         </div>
         
         <div className="space-y-2">
           <h2 className="text-xl font-semibold tracking-tight">{message}</h2>
           <p className="text-sm text-muted-foreground">Isso levará apenas alguns segundos.</p>
         </div>
 
         <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary shadow-inner border">
           <div 
             className="h-full bg-primary transition-all duration-500 ease-out" 
             style={{ width: `${progress}%` }} 
           />
         </div>
         
         <div className="flex justify-between text-xs text-muted-foreground font-medium px-1">
           <span>{progress === 100 ? 'Pronto!' : 'Processando tabelas...'}</span>
           <span>{Math.round(progress)}%</span>
         </div>
       </div>
     </div>
   );
 }