import { useReadOnlyMode } from "@/hooks/useReadOnlyMode";

/**
 * Componente "vazio" que apenas mantém o store global readOnlyState
 * sincronizado com o usuário logado. Renderize-o uma vez na árvore protegida.
 */
export function ReadOnlyModeSync() {
  useReadOnlyMode();
  return null;
}
