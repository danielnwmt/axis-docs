import { Folder, Calendar } from "lucide-react";

const categories: { name: string; count: string; sub: string; date: string }[] = [];

const colors = [
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-warning/10 text-warning",
  "bg-accent/10 text-accent",
];

export function FrequentCategories() {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm animate-fade-in">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-display font-semibold text-foreground">Categorias Frequentes</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
        {categories.map((cat, i) => (
          <div
            key={cat.name}
            className="rounded-xl bg-secondary/50 p-4 hover:bg-secondary transition-colors cursor-pointer group"
          >
            <div className={`w-10 h-10 rounded-lg ${colors[i]} flex items-center justify-center mb-3`}>
              <Folder className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-foreground leading-tight mb-1">{cat.name}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{cat.count}</span> {cat.sub}
            </p>
            {cat.date && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {cat.date}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
