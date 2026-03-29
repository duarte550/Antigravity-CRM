import { BGPattern } from "@/components/ui/bg-pattern";
import { Grid, CircleDot, Scissors, Menu, List, CheckSquare } from "lucide-react";

export default function DemoOne() {
	return (
		<div className="mx-auto max-w-4xl space-y-5 p-8">
            <div className="mb-8">
              <h1 className="text-4xl font-extrabold flex items-center gap-3"><Grid className="size-8" /> Background Patterns Demo</h1>
              <p className="text-muted-foreground mt-2">A showcase of the BGPattern React component mapped against various visual configurations.</p>
              
              {/* Added a stock Unsplash image as requested by the integration steps */}
              <div className="mt-6 w-full h-48 rounded-2xl overflow-hidden shadow-lg border-2">
			    <img 
			  	  src="https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2000&auto=format&fit=crop" 
				  alt="Colorful abstract gradient background" 
				  className="w-full h-full object-cover" 
			    />
			  </div>
            </div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="grid" mask="fade-edges" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><Grid className="size-6" /> Grid Background</h2>
				<p className="text-muted-foreground font-mono">With (fade-edges) Mask</p>
			</div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="dots" mask="fade-center" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><CircleDot className="size-6" /> Dots Background</h2>
				<p className="text-muted-foreground font-mono">With (fade-center) Mask</p>
			</div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="diagonal-stripes" mask="fade-y" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><Scissors className="size-6" /> Diagonal Stripes</h2>
				<p className="text-muted-foreground font-mono">With (fade-y) Mask</p>
			</div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="horizontal-lines" mask="fade-right" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><Menu className="size-6" /> Horizontal Lines</h2>
				<p className="text-muted-foreground font-mono">With (fade-right) Mask</p>
			</div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="vertical-lines" mask="fade-bottom" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><List className="size-6" /> Vertical Lines</h2>
				<p className="text-muted-foreground font-mono">With (fade-bottom) Mask</p>
			</div>

			<div className="relative flex aspect-video flex-col items-center justify-center rounded-2xl border-2 overflow-hidden bg-background">
				<BGPattern variant="checkerboard" mask="fade-top" />
				<h2 className="text-3xl font-bold flex items-center gap-2"><CheckSquare className="size-6" /> Checkerboard Background</h2>
				<p className="text-muted-foreground font-mono">With (fade-top) Mask</p>
			</div>
		</div>
	);
}
