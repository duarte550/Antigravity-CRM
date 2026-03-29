import { Gallery6 } from "@/components/blocks/gallery6"

const demoData = {
  heading: "Featured Projects",
  demoUrl: "https://www.shadcnblocks.com",
  items: [
    {
      id: "item-1",
      title: "Build Modern UIs",
      summary:
        "Create stunning user interfaces with our comprehensive design system.",
      url: "#",
      image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=2072&auto=format&fit=crop",
    },
    {
      id: "item-2",
      title: "Design System Components",
      summary:
        "Explore our library of customizable components built with shadcn/ui and Tailwind CSS.",
      url: "#",
      image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=2070&auto=format&fit=crop",
    },
    {
      id: "item-3",
      title: "Responsive Layouts",
      summary:
        "Build websites that look great on any device with our responsive design patterns.",
      url: "#",
      image: "https://images.unsplash.com/photo-1542744094-24638ea0b3b5?q=80&w=2070&auto=format&fit=crop",
    },
    {
      id: "item-4",
      title: "Developer Experience",
      summary:
        "Streamline your workflow with our developer-friendly tools and documentation.",
      url: "#",
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop",
    },
    {
      id: "item-5",
      title: "Performance First",
      summary:
        "Create fast, optimized websites using our performance-focused components.",
      url: "#",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
    },
  ],
};

function Gallery6Demo() {
  return <Gallery6 {...demoData} />;
}

export { Gallery6Demo };
