import { useState } from "react";
import { Check, ChevronsUpDown, Plus, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (name: string) => void;
  options: ClientOption[];
  placeholder?: string;
  emptyHint?: string;
  className?: string;
}

export function ClientCombobox({
  value,
  onChange,
  options,
  placeholder = "Digite ou selecione um cliente",
  emptyHint = "Nenhum cliente cadastrado",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmedSearch = search.trim();
  const sortedOptions = [...options].sort((a, b) => a.name.localeCompare(b.name));
  const exactMatch = sortedOptions.some(
    (o) => o.name.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCreate = trimmedSearch.length > 0 && !exactMatch;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-11 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Buscar ou digitar nome..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmedSearch
                ? "Nenhum resultado. Pressione Enter para usar este nome."
                : emptyHint}
            </CommandEmpty>
            {showCreate && (
              <CommandGroup heading="Novo">
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 text-primary" />
                  Usar "{trimmedSearch}"
                </CommandItem>
              </CommandGroup>
            )}
            {sortedOptions.length > 0 && (
              <CommandGroup heading="Clientes cadastrados">
                {sortedOptions.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.name}
                    onSelect={() => {
                      onChange(opt.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
