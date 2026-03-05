import React, { useState, useMemo, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  DollarSign,
  Plus,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  User,
  ShoppingCart,
  Calendar,
  Package,
  X,
  ShoppingBag,
  CreditCard,
  Receipt,
  Hash,
  Ban,
  Download,
  Calculator,
  Scissors,
  AlertCircle,
  FileText,
  ShieldCheck
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { useCustomAlert } from "../ui/custom-alert";
import { useDoubleConfirmation } from "../ui/double-confirmation";
import { ventaService, Venta } from "../../services/ventaService";
import { servicioService, Servicio } from "../../services/servicioService";
import { productoService, ApiProducto } from "../../services/productos";
import { apiService, ApiUser, Paquete } from "../../services/api";
import { clientesService, ClienteAPI } from "../../services/clientesService";
import { devolucionService, Devolucion as ApiDevolucion } from "../../services/devolucionService";
import { AppRole } from "../../services/authSyncService";
import { useAuth } from "../AuthContext";
import ImageRenderer from "../ui/ImageRenderer";

// Función para formatear moneda colombiana con puntos para separar miles
const formatCurrency = (amount: number): string => {
  return (amount ?? 0).toLocaleString('es-CO');
};

// Formato estándar DD/MM/AAAA (igual a Compras)
const formatDate = (date: string | Date): string => {
  let dateObj: Date;
  if (typeof date === 'string') {
    const plainDateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (plainDateMatch) {
      const [, year, month, day] = plainDateMatch;
      dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      dateObj = new Date(date);
    }
  } else {
    dateObj = date;
  }

  if (Number.isNaN(dateObj.getTime())) return String(date || '');

  return dateObj.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const normalizeSearchText = (value: unknown): string => {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

// Función auxiliar para normalizar cliente a cadena
const normalizeCliente = (cliente: any): string => {
  if (typeof cliente === 'string') {
    return cliente;
  }
  if (cliente && typeof cliente === 'object') {
    const nombre = cliente.nombre || cliente.Nombre || '';
    const apellido = cliente.apellido || cliente.Apellido || '';
    return `${nombre} ${apellido}`.trim() || 'Cliente';
  }
  return 'Cliente';
};

// Función auxiliar para normalizar barbero a cadena
const normalizeBarbero = (barbero: any): string => {
  if (typeof barbero === 'string') {
    return barbero;
  }
  if (barbero && typeof barbero === 'object') {
    const nombre = barbero.nombre || barbero.Nombre || '';
    const apellido = barbero.apellido || barbero.Apellido || '';
    return `${nombre} ${apellido}`.trim() || 'Sin asignar';
  }
  return 'Sin asignar';
};

// Función para calcular días restantes de garantía
const getRemainingWarrantyDays = (fechaISO: string, garantiaMeses: number): number | null => {
  if (!fechaISO) return null;
  try {
    const fechaVenta = new Date(fechaISO);
    if (isNaN(fechaVenta.getTime())) return null;

    const fechaExp = new Date(fechaVenta);
    if (garantiaMeses && garantiaMeses > 0) {
      fechaExp.setMonth(fechaExp.getMonth() + garantiaMeses);
    } else {
      // Garantía fija de 15 días cuando meses = 0
      fechaExp.setDate(fechaExp.getDate() + 15);
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const expCopy = new Date(fechaExp);
    expCopy.setHours(0, 0, 0, 0);

    const diffTime = expCopy.getTime() - hoy.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch (e) {
    return null;
  }
};

const resolveImageSrc = (rawValue: unknown): string => {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  // Si ya es un formato conocido, lo devolvemos tal cual. 
  // Si es un nombre de archivo solo (legacy), lo devolvemos tal cual para que ImageRenderer le ponga el path de assets.
  return value;
};

interface DevolucionAsociada {
  id: number;
  ventaId: number;
  productoId: number;
  producto: string;
  productoImagen?: string;
  cantidad: number;
  monto: number;
  precioUnitario: number;
  estado: string;
  fecha: string;
  hora: string;
  motivoDetalle: string;
  observaciones?: string;
}




export function VentasPage() {
  const { user } = useAuth();
  const { created, edited, deleted, AlertContainer } = useCustomAlert();
  const { confirmEditAction, DoubleConfirmationContainer } = useDoubleConfirmation();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionAsociada[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [paquetes, setPaquetes] = useState<Paquete[]>([]);
  const [productosAPI, setProductosAPI] = useState<ApiProducto[]>([]);
  const [clientesAPI, setClientesAPI] = useState<ClienteAPI[]>([]);
  const [clientesCatalogo, setClientesCatalogo] = useState<ClienteAPI[]>([]);
  const [barberosAPI, setBarberosAPI] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<Venta | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  // Valor especial para representar "todos los barberos" en el filtro
  const VALOR_TODOS_BARBEROS = "todos";
  // Valor especial para representar "sin barbero" en el formulario de nueva venta
  const VALOR_SIN_BARBERO = "sin-barbero";
  const [barberoSeleccionado, setBarberoSeleccionado] = useState<string>(VALOR_TODOS_BARBEROS);

  const enriquecerVentaConCliente = (venta: Venta, clientes: Array<ClienteAPI | any>): Venta => {
    if (!venta || !clientes || clientes.length === 0) return venta;

    const clientesById = new Map<number, any>();
    const clientesByDocumento = new Map<string, any>();

    clientes.forEach((c: any) => {
      const idNum = Number(c?.id ?? c?.Id);
      if (!Number.isNaN(idNum) && idNum > 0) {
        clientesById.set(idNum, c);
      }
      const doc = String(c?.documento ?? c?.Documento ?? '').trim();
      if (doc) {
        clientesByDocumento.set(doc, c);
      }
    });

    const clienteId = Number(venta.clienteId);
    const documentoActual = String(venta.clienteDocumento || '').trim();
    const nombreActual = String(venta.cliente || '').trim();

    const clienteMatch =
      (!Number.isNaN(clienteId) && clienteId > 0 ? clientesById.get(clienteId) : undefined) ||
      (documentoActual ? clientesByDocumento.get(documentoActual) : undefined);

    if (!clienteMatch) return venta;

    const nombreCatalogo = `${clienteMatch?.nombre || clienteMatch?.Nombre || ''} ${clienteMatch?.apellido || clienteMatch?.Apellido || ''}`.trim();
    const documentoCatalogo = String(clienteMatch?.documento || clienteMatch?.Documento || '').trim();

    const nombreNormalizado = nombreActual.toLowerCase();
    const nombreEsGenerico =
      !nombreActual ||
      ['cliente', 'n/a', 'na', 'sin cliente', 'null', 'undefined'].includes(nombreNormalizado) ||
      /^\d+$/.test(nombreActual) ||
      /^\[object object\]$/i.test(nombreActual) ||
      /^cliente\s*\d*$/i.test(nombreActual);
    const documentoFaltante =
      !documentoActual ||
      ['n/a', 'na', '-'].includes(documentoActual.toLowerCase());

    return {
      ...venta,
      cliente: (nombreEsGenerico && nombreCatalogo) ? nombreCatalogo : venta.cliente,
      clienteDocumento: documentoFaltante ? (documentoCatalogo || venta.clienteDocumento) : venta.clienteDocumento
    };
  };

  // Cargar ventas desde la API al montar el componente
  useEffect(() => {
    cargarVentas();
  }, []);

  const cargarVentas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cargar todos los datos necesarios en paralelo
      const [ventasData, serviciosData, productosData, usuariosData, paquetesData, clientesData, devolucionesData] = await Promise.all([
        ventaService.getVentas().catch(() => []),
        servicioService.getServicios().catch(() => []),
        productoService.getProductos().catch(() => []),
        apiService.getUsuarios().catch(() => []),
        apiService.getPaquetes().catch(() => []),
        clientesService.getClientes().catch(() => []),
        devolucionService.getDevoluciones().catch(() => [])
      ]);

      console.log('🔍 Ventas cargadas:', ventasData.length);
      console.log('🔍 Servicios cargados:', serviciosData?.length || 0);
      console.log('🔍 Paquetes cargados:', paquetesData?.length || 0);
      console.log('🔍 Productos cargados:', productosData?.length || 0);
      console.log('🔍 Usuarios cargados:', usuariosData?.length || 0);
      console.log('🔍 Clientes cargados (tabla clientes):', clientesData?.length || 0);
      console.log('🔍 Devoluciones cargadas:', devolucionesData?.length || 0);

      const saldoPorCliente = new Map<number, number>();
      (devolucionesData as ApiDevolucion[] || []).forEach((d: any) => {
        const estado = String(d?.estado || '').trim();
        if (estado === 'Activo' || estado === 'Completada' || estado === 'Procesado') {
          const cId = Number(d?.clienteId || 0);
          if (cId > 0) {
            const prev = saldoPorCliente.get(cId) || 0;
            saldoPorCliente.set(cId, prev + (Number(d?.saldoAFavor) || 0));
          }
        }
      });
      const clientesConSaldo = (clientesData || []).map((cliente: any) => ({
        ...cliente,
        saldoAFavor: saldoPorCliente.get(Number(cliente.id)) || 0
      }));

      setClientesCatalogo(clientesConSaldo);
      const ventasEnriquecidas = (ventasData || []).map((venta: Venta) =>
        enriquecerVentaConCliente(venta, clientesConSaldo)
      );
      setVentas(ventasEnriquecidas);
      setServicios((serviciosData || []).filter(s => s.estado === true));
      setPaquetes((paquetesData || []).filter(p => p.activo === true));
      setProductosAPI((productosData || []).filter(p => p.activo === true));

      const devolucionesNormalizadas: DevolucionAsociada[] = (devolucionesData as ApiDevolucion[]).map((d: any) => {
        // ... (rest of the normalization logic)
        const cantidad = Number(d?.cantidad || 0);
        const monto = Number(d?.monto || 0);
        const fechaRaw = String(d?.fecha || '');
        const fechaObj = fechaRaw ? new Date(fechaRaw) : null;
        const productoId = Number(d?.productoId || 0);
        const productoEnCatalogo = (productosData || []).find((p: any) => Number(p?.id || 0) === productoId) as any;
        const imagenCatalogo = String(
          productoEnCatalogo?.imagen ||
          productoEnCatalogo?.imagenProduc ||
          productoEnCatalogo?.imagenUrl ||
          ''
        );

        return {
          id: Number(d?.id || 0),
          ventaId: Number(d?.ventaId || 0),
          productoId: Number(d?.productoId || 0),
          producto: String(d?.productoNombre || 'Producto'),
          productoImagen: String((d as any)?.productoImagen || (d as any)?.imagenProducto || imagenCatalogo || ''),
          cantidad,
          monto,
          precioUnitario: cantidad > 0 ? monto / cantidad : 0,
          estado: String(d?.estado || 'Completada'),
          fecha: fechaObj && !Number.isNaN(fechaObj.getTime()) ? fechaObj.toLocaleDateString('es-CO') : '',
          hora: fechaObj && !Number.isNaN(fechaObj.getTime())
            ? fechaObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
            : '',
          motivoDetalle: String((d as any)?.motivoDetalle || d?.motivo || ''),
          observaciones: String(d?.observaciones || '')
        };
      });
      setDevoluciones(devolucionesNormalizadas);

      // Clientes para ventas: usar SIEMPRE la tabla de clientes (IDs válidos para FK ClienteId)
      const clientesActivos = clientesConSaldo.filter((c: any) => c.estado === true);
      setClientesAPI(clientesActivos);
      console.log('🔍 Clientes activos (con saldo calculado):', clientesActivos.length);

      // Filtrar barberos: Usuarios activos que NO son Clientes ni Administradores
      const barberos = usuariosData.filter((u: any) =>
        u.rolId !== AppRole.CLIENTE &&
        u.rolId !== AppRole.ADMIN &&
        u.estado === true
      );

      // Si la lista de barberos está vacía, incluimos a los admins activos para que el sistema sea funcional
      if (barberos.length === 0) {
        setBarberosAPI(usuariosData.filter((u: any) => (u.rolId === AppRole.ADMIN || u.rolId === 1) && u.estado === true));
      } else {
        setBarberosAPI(barberos);
      }
      console.log('🔍 Barberos filtrados:', barberos.length);

      // Verificar servicios disponibles después de cargar
      setTimeout(() => {
        console.log('🔍 serviciosDisponibles después de cargar:', serviciosDisponibles);
      }, 100);

    } catch (err: any) {
      console.error('Error cargando datos:', err);
      setError(err.message || 'Error al cargar los datos');
      toast.error('Error al cargar los datos. Por favor, intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const generateCurrentDate = () => {
    return new Date().toISOString().split('T')[0] || "";
  };

  const inicialNuevaVenta = {
    clienteId: null as number | null,
    clienteDocumento: "",
    fechaCreacion: "",
    metodoPago: "",
    barberoId: null as number | null,
    barberoNombre: "",
    porcentajeDescuento: 0,
    usarSaldoAFavor: false,
    montoSaldoUsado: 0,
    garantiaMeses: 0,
    productos: [] as { id: string; nombre: string; cantidad: number; precio: number; imagen?: string }[],
  };

  // Usar servicios y paquetes cargados desde la API
  const serviciosDisponibles = useMemo(() => {
    const serviciosNombres = servicios.map(s => s.nombre).filter(Boolean);
    const paquetesNombres = paquetes.map(p => `[PAQUETE] ${p.nombre}`).filter(Boolean);

    const combinado = [...serviciosNombres, ...paquetesNombres].sort();

    // Si no hay nada, usar fallback
    if (combinado.length === 0) {
      return [
        "Corte Clásico",
        "Barba Completa",
        "Corte + Barba",
        "Tinte Cabello",
        "Tratamiento Capilar"
      ];
    }

    return combinado;
  }, [servicios, paquetes]);

  // Barberos disponibles para el filtro y la creación
  const barberosDisponibles = useMemo(() => {
    return barberosAPI.map(b => `${b.nombre} ${b.apellido || ''}`.trim()).sort();
  }, [barberosAPI]);

  // Clientes disponibles para asignar a una venta
  const clientesDisponibles = useMemo(() => {
    return clientesAPI.map(c => ({
      nombre: `${c.nombre || ''} ${c.apellido || ''}`.trim(),
      documento: c.documento || '',
      id: Number(c.id),
      saldoAFavor: Number((c as any).saldoAFavor || 0)
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [clientesAPI]);

  const [nuevaVenta, setNuevaVenta] = useState(inicialNuevaVenta);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidadProducto, setCantidadProducto] = useState(0);
  const [cantidadProductoInput, setCantidadProductoInput] = useState('');
  const [porcentajeDescuentoInput, setPorcentajeDescuentoInput] = useState('');
  const [isServicioDialogOpen, setIsServicioDialogOpen] = useState(false);
  const [servicioSeleccionado, setServicioSeleccionado] = useState('');
  const [serviciosAgregados, setServiciosAgregados] = useState<Array<{ id: string; nombre: string; precio: number; cantidad: number; imagen?: string }>>([]);
  const [tarjetaProductoInputs, setTarjetaProductoInputs] = useState<Record<string, { cantidad?: string; precio?: string }>>({});
  const [tarjetaServicioInputs, setTarjetaServicioInputs] = useState<Record<string, { cantidad?: string; precio?: string }>>({});
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [showClientResults, setShowClientResults] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const [serviceSearchTerm, setServiceSearchTerm] = useState("");
  const [showServiceResults, setShowServiceResults] = useState(false);
  const [showVentaFormErrors, setShowVentaFormErrors] = useState(false);
  const [showAddProductoErrors, setShowAddProductoErrors] = useState(false);
  const [showAddServicioErrors, setShowAddServicioErrors] = useState(false);
  const [ventaValidationAttempt, setVentaValidationAttempt] = useState(0);

  // Calculate next venta number for display
  const numeroVenta = ventas.length + 1;
  const shakeClass = ventaValidationAttempt % 2 === 0 ? 'input-required-shake-a' : 'input-required-shake-b';
  const noItemsAgregados = (nuevaVenta.productos?.length || 0) === 0 && serviciosAgregados.length === 0;
  const mustChooseProducto = showVentaFormErrors && noItemsAgregados && !servicioSeleccionado;
  const mustChooseServicio = showVentaFormErrors && noItemsAgregados && !productoSeleccionado;
  const mustSetCantidadProducto = mustChooseProducto && !!productoSeleccionado && cantidadProducto <= 0;
  const showProductoSelectorError = (mustChooseProducto && !productoSeleccionado) || (showAddProductoErrors && !productoSeleccionado);
  const showCantidadProductoError = mustSetCantidadProducto || (showAddProductoErrors && cantidadProducto <= 0);
  const showServicioSelectorError = (mustChooseServicio && !servicioSeleccionado) || (showAddServicioErrors && !servicioSeleccionado);

  const isStockExceeded = useMemo(() => {
    if (!productoSeleccionado || cantidadProducto <= 0) return false;
    const producto = productosAPI.find(p => p.id.toString() === productoSeleccionado);
    if (!producto) return false;
    const yaAgregado = (nuevaVenta.productos || []).find(p => p.id === productoSeleccionado);
    const cantYaAgregada = yaAgregado ? yaAgregado.cantidad : 0;
    return (cantidadProducto + cantYaAgregada) > producto.stockVentas;
  }, [productoSeleccionado, cantidadProducto, nuevaVenta.productos, productosAPI]);

  const filteredVentas = useMemo(() => {
    const query = normalizeSearchText(searchTerm);
    return ventas.filter((venta) => {
      const clienteStr = normalizeCliente(venta.cliente);
      const barberoStr = normalizeBarbero(venta.barbero);
      const searchableText = normalizeSearchText([
        venta.id,
        venta.numeroVenta,
        venta.clienteDocumento,
        clienteStr,
        formatCurrency(venta.total),
        venta.total,
        formatDate(venta.fecha),
        venta.estado,
        venta.metodoPago,
        barberoStr,
        venta.clienteId
      ].join(' '));
      const matchesSearch = query.length === 0 || searchableText.includes(query);
      const matchesBarbero =
        barberoSeleccionado === VALOR_TODOS_BARBEROS ||
        barberoStr === barberoSeleccionado;
      return matchesSearch && matchesBarbero;
    });
  }, [ventas, searchTerm, barberoSeleccionado]);

  const totalPages = Math.max(1, Math.ceil(filteredVentas.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedVentas = filteredVentas.slice(startIndex, startIndex + itemsPerPage);

  // Reset página al filtrar
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(parseInt(value));
    setCurrentPage(1);
  };

  // Cálculo de totales SOLO sobre servicios de las ventas filtradas del barbero
  const {
    totalServiciosFiltrados,
    totalBarbero,
    totalBarberia,
  } = useMemo(() => {
    // Solo ventas completadas para comisiones
    const ventasParaComision = filteredVentas.filter(
      (venta) =>
        venta.estado === "Completada" &&
        venta.serviciosDetalle &&
        venta.serviciosDetalle.length > 0
    );

    const totalServicios = ventasParaComision.reduce((acum, venta) => {
      const totalServiciosVenta = venta.serviciosDetalle.reduce(
        (suma: number, servicio: any) => suma + (servicio.precio || 0),
        0
      );
      return acum + totalServiciosVenta;
    }, 0);

    const totalBarberoCalc = totalServicios * 0.6;
    const totalBarberiaCalc = totalServicios * 0.4;

    return {
      totalServiciosFiltrados: totalServicios,
      totalBarbero: totalBarberoCalc,
      totalBarberia: totalBarberiaCalc,
    };
  }, [filteredVentas]);

  const getEstadoColor = (estado: string) => {
    const estadoNormalizado = (estado || '').toLowerCase().trim();
    if (estadoNormalizado === 'anulada' || estadoNormalizado === 'anulado') {
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    }
    if (estadoNormalizado === 'completada' || estadoNormalizado === 'completado' || estadoNormalizado === 'activo') {
      return 'bg-green-500/10 text-green-400 border border-green-500/20';
    }
    if (estadoNormalizado === 'pendiente') {
      return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
    }
    if (estadoNormalizado === 'procesado') {
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    }
    return 'bg-gray-medium text-gray-lighter';
  };

  const getProductoDetalleImage = (producto: any): string => {
    const nombreProducto = String(producto?.nombre || '').trim().toLowerCase();
    const productoId = Number(String(producto?.id || '').replace(/\D/g, ''));

    const productoCatalogo = productosAPI.find((p: any) => {
      const sameId = !Number.isNaN(productoId) && productoId > 0 && Number(p.id) === productoId;
      const sameName = !!nombreProducto && String(p.nombre || '').trim().toLowerCase() === nombreProducto;
      return sameId || sameName;
    });

    return resolveImageSrc(
      producto?.imagen ||
      producto?.imagenProduc ||
      producto?.imagenUrl ||
      producto?.Imagen ||
      producto?.ImagenProduc ||
      producto?.ImagenUrl ||
      productoCatalogo?.imagenProduc ||
      (productoCatalogo as any)?.imagen ||
      (productoCatalogo as any)?.imagenUrl ||
      ''
    );
  };

  const getServicioDetalleImage = (servicio: any): string => {
    const servicioIdRaw = String(servicio?.id || '');
    const nombreServicio = String(servicio?.nombre || '').trim().toLowerCase();
    const paqueteId = servicioIdRaw.startsWith('PAQ-') ? Number(servicioIdRaw.replace('PAQ-', '')) : Number.NaN;
    const servicioId = servicioIdRaw.startsWith('SERV-')
      ? Number(servicioIdRaw.replace('SERV-', ''))
      : Number(servicioIdRaw);

    const paqueteMatch = ((!Number.isNaN(paqueteId) && paqueteId > 0)
      ? paquetes.find((p: any) => Number(p.id) === paqueteId)
      : undefined) || paquetes.find((p: any) => {
        const nombrePaquete = String(p?.nombre || '').trim().toLowerCase();
        return !!nombreServicio && nombrePaquete === nombreServicio;
      });

    const servicioMatch = ((!Number.isNaN(servicioId) && servicioId > 0)
      ? servicios.find((s: any) => Number(s.id) === servicioId)
      : undefined) || servicios.find((s: any) => {
        const nombre = String(s?.nombre || '').trim().toLowerCase();
        return !!nombreServicio && nombre === nombreServicio;
      });

    return resolveImageSrc(
      servicio?.imagen ||
      servicio?.imagenServicio ||
      servicio?.imagenUrl ||
      servicio?.Imagen ||
      servicio?.ImagenServicio ||
      servicio?.ImagenUrl ||
      (paqueteMatch as any)?.imagen ||
      (paqueteMatch as any)?.imagenUrl ||
      (servicioMatch as any)?.imagen ||
      (servicioMatch as any)?.imagenServicio ||
      (servicioMatch as any)?.imagenUrl ||
      ''
    );
  };

  const devolucionesVentaActual = useMemo(() => {
    if (!selectedVenta) return [];
    const ventaIdNum = Number(selectedVenta.id);
    return devoluciones.filter(d => {
      const matchId = Number(d.ventaId) === ventaIdNum;
      const estado = (d.estado || '').toLowerCase().trim();
      const noAnulada = estado !== 'anulada' && estado !== 'anulado';
      const motivoDet = String((d as any).motivoDetalle || '').toLowerCase();
      const motivoCat = String((d as any).motivo || (d as any).motivoCategoria || '').toLowerCase();
      const esConsumoSaldo = (motivoDet.includes('consumo') && motivoDet.includes('saldo')) || (motivoCat.includes('consumo') && motivoCat.includes('saldo'));
      return matchId && noAnulada && !esConsumoSaldo;
    });
  }, [selectedVenta, devoluciones]);

  const totalMontoDevuelto = useMemo(() => {
    return devolucionesVentaActual.reduce((sum, d) => sum + (d.monto || 0), 0);
  }, [devolucionesVentaActual]);

  const detalleItemsVenta = useMemo(() => {
    if (!selectedVenta) return [];

    const devolucionPorProductoId = new Map<number, number>();
    const devolucionPorNombre = new Map<string, number>();
    devolucionesVentaActual.forEach(dev => {
      const devProdId = Number((dev as any).productoId || 0);
      if (devProdId > 0) {
        devolucionPorProductoId.set(devProdId, (devolucionPorProductoId.get(devProdId) || 0) + (dev.cantidad || 0));
      }
      const nombre = (dev.producto || '').toLowerCase().trim();
      if (nombre) {
        devolucionPorNombre.set(nombre, (devolucionPorNombre.get(nombre) || 0) + (dev.cantidad || 0));
      }
    });

    const productosItems = (selectedVenta.productosDetalle || []).map((producto: any, index: number) => {
      const cantidadOriginal = Number(producto?.cantidad || 1);
      const precio = Number(producto?.precio || 0);
      const nombre = String(producto?.nombre || 'Producto');
      const prodId = Number(producto?.id || producto?.productoId || producto?.ProductoId || 0);

      const cantidadDevuelta = (prodId > 0 ? devolucionPorProductoId.get(prodId) : undefined)
        ?? devolucionPorNombre.get(nombre.toLowerCase().trim())
        ?? 0;
      const cantidadFinal = Math.max(0, cantidadOriginal - cantidadDevuelta);
      return {
        key: `producto-${producto?.id ?? index}-${index}`,
        nombre,
        tipo: 'Producto',
        cantidadOriginal,
        cantidadDevuelta,
        cantidad: cantidadFinal,
        precio,
        subtotal: cantidadFinal * precio,
        imageSrc: getProductoDetalleImage(producto),
        fallbackIcon: 'producto' as const
      };
    });

    const serviciosItems = (selectedVenta.serviciosDetalle || []).map((servicio: any, index: number) => {
      const cantidad = Number(servicio?.cantidad || 1);
      const precio = Number(servicio?.precio || 0);
      return {
        key: `servicio-${servicio?.id ?? index}-${index}`,
        nombre: String(servicio?.nombre || 'Servicio'),
        tipo: 'Servicio',
        cantidadOriginal: cantidad,
        cantidadDevuelta: 0,
        cantidad,
        precio,
        subtotal: cantidad * precio,
        imageSrc: getServicioDetalleImage(servicio),
        fallbackIcon: 'servicio' as const
      };
    });

    return [...productosItems, ...serviciosItems];
  }, [selectedVenta, productosAPI, servicios, paquetes, devolucionesVentaActual]);

  const subtotalAjustado = useMemo(() => {
    return detalleItemsVenta.reduce((sum, item) => sum + item.subtotal, 0);
  }, [detalleItemsVenta]);

  const totalItemsDevueltos = useMemo(() => {
    return detalleItemsVenta.reduce((sum, item) => sum + item.cantidadDevuelta, 0);
  }, [detalleItemsVenta]);

  // Saldo a favor usado: tomar del campo si viene de la API;
  // si no, derivarlo de la aritmética de la venta.
  const saldoUsadoDetalle = useMemo(() => {
    if (!selectedVenta) return 0;
    // Prioridad: usar exactamente 'SaldoAFavorUsado' (PascalCase) si viene del backend
    const explicit = Number(
      (selectedVenta as any).SaldoAFavorUsado ??
      (selectedVenta as any).saldoAFavorUsado ??
      (selectedVenta as any).SaldoAFavor ??
      (selectedVenta as any).saldoAFavorUsado ??
      (selectedVenta as any).saldoAFavor ??
      0
    );
    if (explicit > 0) return explicit;
    const subtotal = Number(selectedVenta.subtotal || 0);
    const iva = Number((selectedVenta as any).iva || 0);
    const descuento = Number(selectedVenta.descuento || 0);
    const total = Number(selectedVenta.total || 0);
    const candidates = [
      subtotal - total,
      subtotal + iva - descuento - total
    ].filter(v => Number.isFinite(v) && v > 0) as number[];
    if (candidates.length === 0) return 0;
    const best = Math.max(...candidates);
    return Math.max(0, Math.min(best, subtotal));
  }, [selectedVenta]);


  const calcularSubtotal = () => {
    let subtotal = 0;

    // Calcular subtotal de productos
    if (nuevaVenta.productos && Array.isArray(nuevaVenta.productos)) {
      subtotal += nuevaVenta.productos.reduce((total, producto) =>
        total + (producto.precio * producto.cantidad), 0
      );
    }

    // Calcular subtotal de servicios y paquetes
    serviciosAgregados.forEach(servicioAgregado => {
      // Usar siempre el precio almacenado (puede haber sido modificado por el usuario)
      subtotal += (servicioAgregado.precio * servicioAgregado.cantidad);
    });

    console.log(`🔍 Subtotal calculado: ${subtotal}`);
    return subtotal;
  };

  const calcularDescuento = (subtotal: number) => {
    return subtotal * (nuevaVenta.porcentajeDescuento / 100);
  };

  const handleCantidadProductoInputChange = (valor: string) => {
    if (valor.trim() === '') {
      setCantidadProductoInput('');
      setCantidadProducto(0);
      return;
    }

    const numero = Number(valor);
    if (Number.isNaN(numero)) return;

    const cantEntera = Math.max(0, Math.floor(numero));

    setCantidadProductoInput(valor);
    if (showAddProductoErrors) {
      setShowAddProductoErrors(false);
    }
    setCantidadProducto(cantEntera);
  };

  const handlePorcentajeDescuentoInputChange = (valor: string) => {
    setPorcentajeDescuentoInput(valor);
    if (valor.trim() === '') {
      setNuevaVenta({ ...nuevaVenta, porcentajeDescuento: 0 });
      return;
    }
    const numero = Number(valor);
    if (!Number.isNaN(numero)) {
      const normalizado = Math.max(0, Math.min(100, numero));
      setNuevaVenta({ ...nuevaVenta, porcentajeDescuento: normalizado });
    }
  };

  const calcularTotal = () => {
    const subtotal = calcularSubtotal();
    const iva = calcularIva(subtotal);
    const descuento = calcularDescuento(subtotal);
    const totalVenta = subtotal + iva - descuento;

    if (nuevaVenta.usarSaldoAFavor) {
      const cliente = clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId));
      const saldoDisponible = cliente?.saldoAFavor || 0;
      const montoAUsar = Math.min(totalVenta, saldoDisponible);
      return Math.max(0, totalVenta - montoAUsar);
    }

    return Math.max(0, totalVenta);
  };

  const calcularIva = (subtotal: number) => {
    return 0;
  };

  const agregarProducto = () => {
    if (!productoSeleccionado || cantidadProducto <= 0) {
      setShowAddProductoErrors(true);
      setVentaValidationAttempt((prev) => prev + 1);
      return;
    }

    // Buscar en productos cargados de la API
    const producto = productosAPI.find(p => p.id.toString() === productoSeleccionado);
    if (!producto) {
      setShowAddProductoErrors(true);
      setVentaValidationAttempt((prev) => prev + 1);
      return;
    }

    const productosActuales = nuevaVenta.productos || [];

    // VALIDACIÓN DE STOCK DEFINITIVA
    if (isStockExceeded) {
      setVentaValidationAttempt((prev) => prev + 1);
      return; // No permitimos agregar si excede stock
    }

    const existeProducto = productosActuales.find(p => p.id === producto.id.toString());

    if (existeProducto) {
      const cantidadActualizada = existeProducto.cantidad + cantidadProducto;

      setNuevaVenta({
        ...nuevaVenta,
        productos: productosActuales.map(p =>
          p.id === producto.id.toString()
            ? { ...p, cantidad: cantidadActualizada }
            : p
        )
      });
      setTarjetaProductoInputs((prev) => ({
        ...prev,
        [producto.id.toString()]: {
          ...prev[producto.id.toString()],
          cantidad: String(cantidadActualizada)
        }
      }));
    } else {

      setNuevaVenta({
        ...nuevaVenta,
        productos: [...productosActuales, {
          id: producto.id.toString(),
          nombre: producto.nombre,
          cantidad: cantidadProducto,
          precio: producto.precio || producto.precioBase,
          imagen: (producto as ApiProducto).imagenProduc || ''
        }]
      });
      setTarjetaProductoInputs((prev) => ({
        ...prev,
        [producto.id.toString()]: {
          cantidad: String(cantidadProducto),
          precio: String(producto.precio || producto.precioBase)
        }
      }));
    }

    setShowAddProductoErrors(false);
    setShowVentaFormErrors(false);
  };

  const eliminarProducto = (productId: string) => {
    const productosActuales = nuevaVenta.productos || [];
    setNuevaVenta({
      ...nuevaVenta,
      productos: productosActuales.filter(p => p.id !== productId)
    });
    setTarjetaProductoInputs((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const actualizarCantidadProducto = (productId: string, nuevaCantidad: number) => {
    if (nuevaCantidad < 1) return;

    // VALIDACIÓN DE STOCK
    const productoInfo = productosAPI.find(p => p.id.toString() === productId);
    if (productoInfo && nuevaCantidad > productoInfo.stockVentas) {
      toast.error("No se puede añadir una cantidad superior a la que hay en el stock", {
        description: `Stock disponible: ${productoInfo.stockVentas}`,
        style: {
          background: 'var(--color-gray-darkest)',
          border: '1px solid #DC2626',
          color: 'var(--color-white-primary)',
        }
      });

      // Si excedió el stock, revertimos el input visual a la cantidad anterior
      const cantAnterior = nuevaVenta.productos?.find(p => p.id === productId)?.cantidad || 1;
      setTarjetaProductoInputs((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          cantidad: String(cantAnterior)
        }
      }));
      return;
    }

    const productosActuales = nuevaVenta.productos || [];
    setNuevaVenta({
      ...nuevaVenta,
      productos: productosActuales.map(p =>
        p.id === productId ? { ...p, cantidad: nuevaCantidad } : p
      )
    });
    setTarjetaProductoInputs((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        cantidad: String(nuevaCantidad)
      }
    }));
  };

  const actualizarPrecioProducto = (productId: string, nuevoPrecio: number) => {
    if (nuevoPrecio < 0) return;
    const productosActuales = nuevaVenta.productos || [];
    setNuevaVenta({
      ...nuevaVenta,
      productos: productosActuales.map(p =>
        p.id === productId ? { ...p, precio: nuevoPrecio } : p
      )
    });
    setTarjetaProductoInputs((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        precio: String(nuevoPrecio)
      }
    }));
  };

  const agregarServicio = () => {
    if (!servicioSeleccionado) {
      setShowAddServicioErrors(true);
      setVentaValidationAttempt((prev) => prev + 1);
      return;
    }

    let precioServicio = 0;
    let servicioId = '';
    let imagenServicio = '';

    // Verificar si es un paquete
    if (servicioSeleccionado.startsWith('[PAQUETE] ')) {
      const nombreReal = servicioSeleccionado.replace('[PAQUETE] ', '');
      const paquete = paquetes.find(p => p.nombre === nombreReal);
      if (paquete && paquete.precio) {
        precioServicio = paquete.precio;
        servicioId = `PAQ-${paquete.id}`;
        imagenServicio = String((paquete as any)?.imagen || (paquete as any)?.imagenUrl || '');
      }
    } else {
      // Es un servicio normal
      const servicio = servicios.find(s => s.nombre === servicioSeleccionado);
      if (servicio && servicio.precio) {
        precioServicio = servicio.precio;
        servicioId = `SERV-${servicio.id}`;
        imagenServicio = String((servicio as any)?.imagen || (servicio as any)?.imagenServicio || (servicio as any)?.imagenUrl || '');
      } else {
        // Fallback para servicios sin precio
        const preciosFallback: { [key: string]: number } = {
          "Corte Clásico": 25000,
          "Barba Completa": 20000,
          "Corte + Barba": 40000,
          "Tinte Cabello": 80000,
          "Tratamiento Capilar": 35000
        };
        precioServicio = preciosFallback[servicioSeleccionado] || 0;
        servicioId = `SERVPERS-${Date.now()}`;
      }
    }

    const existente = serviciosAgregados.find(s => s.nombre === servicioSeleccionado);
    if (existente) {
      const cantidadActualizada = existente.cantidad + 1;
      setServiciosAgregados(serviciosAgregados.map(s =>
        s.nombre === servicioSeleccionado ? { ...s, cantidad: cantidadActualizada } : s
      ));
      setTarjetaServicioInputs((prev) => ({
        ...prev,
        [existente.id]: {
          ...prev[existente.id],
          cantidad: String(cantidadActualizada)
        }
      }));
    } else {
      const nuevoId = servicioId || `SERVPERS-${Date.now()}`;
      setServiciosAgregados([
        ...serviciosAgregados,
        {
          id: nuevoId,
          nombre: servicioSeleccionado,
          precio: precioServicio,
          cantidad: 1,
          imagen: imagenServicio
        }
      ]);
      setTarjetaServicioInputs((prev) => ({
        ...prev,
        [nuevoId]: {
          cantidad: '1',
          precio: String(precioServicio)
        }
      }));
    }

    setServicioSeleccionado('');
    setShowAddServicioErrors(false);
    setShowVentaFormErrors(false);
  };

  const eliminarServicio = (servicioId: string) => {
    setServiciosAgregados(serviciosAgregados.filter(s => s.id !== servicioId));
    setTarjetaServicioInputs((prev) => {
      const next = { ...prev };
      delete next[servicioId];
      return next;
    });
  };

  const actualizarPrecioServicio = (servicioId: string, nuevoPrecio: number) => {
    setServiciosAgregados(serviciosAgregados.map(s =>
      s.id === servicioId ? { ...s, precio: Math.max(0, nuevoPrecio) } : s
    ));
    setTarjetaServicioInputs((prev) => ({
      ...prev,
      [servicioId]: {
        ...prev[servicioId],
        precio: String(Math.max(0, nuevoPrecio))
      }
    }));
  };

  const actualizarCantidadServicio = (servicioId: string, nuevaCantidad: number) => {
    if (nuevaCantidad < 1) return;
    setServiciosAgregados(serviciosAgregados.map(s =>
      s.id === servicioId ? { ...s, cantidad: nuevaCantidad } : s
    ));
    setTarjetaServicioInputs((prev) => ({
      ...prev,
      [servicioId]: {
        ...prev[servicioId],
        cantidad: String(nuevaCantidad)
      }
    }));
  };

  const getTarjetaProductoInput = (productId: string, campo: 'cantidad' | 'precio', fallback: number) => {
    const visual = tarjetaProductoInputs[productId]?.[campo];
    if (visual !== undefined) return visual;
    return fallback > 0 ? String(fallback) : '';
  };

  const onTarjetaProductoInputChange = (productId: string, campo: 'cantidad' | 'precio', valor: string) => {
    setTarjetaProductoInputs((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [campo]: valor
      }
    }));
    if (valor.trim() === '') return;
    const n = Number(valor);
    if (Number.isNaN(n)) return;
    if (campo === 'cantidad') actualizarCantidadProducto(productId, Math.max(1, Math.floor(n)));
    if (campo === 'precio') actualizarPrecioProducto(productId, Math.max(0, n));
  };

  const getTarjetaServicioInput = (servicioId: string, campo: 'cantidad' | 'precio', fallback: number) => {
    const visual = tarjetaServicioInputs[servicioId]?.[campo];
    if (visual !== undefined) return visual;
    return fallback > 0 ? String(fallback) : '';
  };

  const onTarjetaServicioInputChange = (servicioId: string, campo: 'cantidad' | 'precio', valor: string) => {
    setTarjetaServicioInputs((prev) => ({
      ...prev,
      [servicioId]: {
        ...prev[servicioId],
        [campo]: valor
      }
    }));
    if (valor.trim() === '') return;
    const n = Number(valor);
    if (Number.isNaN(n)) return;
    if (campo === 'cantidad') actualizarCantidadServicio(servicioId, Math.max(1, Math.floor(n)));
    if (campo === 'precio') actualizarPrecioServicio(servicioId, Math.max(0, n));
  };

  // Función para abrir el diálogo de detalles
  const handleViewDetails = async (venta: Venta) => {
    try {
      setLoadingDetails(true);
      setIsDetailDialogOpen(true);
      setSelectedVenta(venta); // Mostrar datos básicos mientras carga

      // Cargar detalles completos de la venta
      const ventaConDetalles = await ventaService.getVentaById(venta.id);
      if (ventaConDetalles) {
        const ventaEnriquecida = enriquecerVentaConCliente(ventaConDetalles, clientesCatalogo);
        setSelectedVenta({
          ...ventaEnriquecida,
          // Fallback: si el endpoint de detalle no trae productos/servicios, conservar los ya cargados en la tabla.
          productosDetalle: (ventaEnriquecida.productosDetalle && ventaEnriquecida.productosDetalle.length > 0)
            ? ventaEnriquecida.productosDetalle
            : (venta.productosDetalle || []),
          serviciosDetalle: (ventaEnriquecida.serviciosDetalle && ventaEnriquecida.serviciosDetalle.length > 0)
            ? ventaEnriquecida.serviciosDetalle
            : (venta.serviciosDetalle || [])
        });
      } else {
        toast.error('No se pudieron cargar los detalles de la venta');
      }
    } catch (error: any) {
      console.error('Error cargando detalles de venta:', error);
      toast.error('Error al cargar los detalles de la venta');
      // Si falla, mantener los datos básicos que tenemos
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateVenta = async () => {
    setShowVentaFormErrors(true);
    setVentaValidationAttempt((prev) => prev + 1);

    if (!user || !user.id) {
      toast.error("Error de sesión", { description: "No se ha identificado el usuario responsable. Por favor inicie sesión nuevamente." });
      return;
    }

    const productosActuales = nuevaVenta.productos || [];
    const tieneServicios = serviciosAgregados.length > 0;

    if (nuevaVenta.clienteId === null || !nuevaVenta.metodoPago) {
      toast.error("Por favor completa el cliente y el método de pago");
      return;
    }

    if (productosActuales.length === 0 && !tieneServicios) {
      toast.error("Debes agregar al menos un producto o un servicio a la venta");
      return;
    }

    // Validar que los productos tengan IDs válidos
    const productosInvalidos = productosActuales.filter(p => !p.id || isNaN(parseInt(p.id)));
    if (productosInvalidos.length > 0) {
      console.error('❌ Productos con IDs inválidos:', productosInvalidos);
      toast.error(`Error: ${productosInvalidos.length} producto(s) tienen IDs inválidos`);
      return;
    }

    // Validar que haya al menos un detalle válido después del filtrado
    const serviciosValidos = tieneServicios
      ? serviciosAgregados.filter((servicioAgregado) => {
        return (
          typeof servicioAgregado.id === 'string' &&
          (servicioAgregado.id.startsWith('SERV-') || servicioAgregado.id.startsWith('PAQ-'))
        );
      })
      : [];

    if (productosActuales.length === 0 && serviciosValidos.length === 0) {
      toast.error("Debes agregar al menos un producto o servicio válido a la venta");
      return;
    }

    try {
      // Use the already calculated numeroVenta from component level
      const subtotal = calcularSubtotal();
      const iva = calcularIva(subtotal);
      const descuento = calcularDescuento(subtotal);
      const total = calcularTotal();
      const productosTexto = productosActuales.length > 0
        ? productosActuales.map(p => `${p.nombre} (x${p.cantidad})`).join(', ')
        : 'Ninguno';

      const serviciosTexto = tieneServicios
        ? serviciosAgregados.map(s => `${s.nombre} (x${s.cantidad})`).join(', ')
        : 'Ninguno';

      const clienteSeleccionado = clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId));
      const barberoSeleccionadoData = nuevaVenta.barberoId
        ? barberosAPI.find(b => b.id === Number(nuevaVenta.barberoId))
        : null;

      const ventaData = {
        numeroVenta,
        clienteId: nuevaVenta.clienteId,
        usuarioId: Number(user.id),
        clienteDocumento: nuevaVenta.clienteDocumento || '',
        fecha: nuevaVenta.fechaCreacion,
        servicios: serviciosTexto,
        productos: productosTexto,
        subtotal: subtotal,
        iva: 0,
        descuento: descuento,
        total: total,
        barberoId: nuevaVenta.barberoId ?? undefined,
        barberoNombre: nuevaVenta.barberoNombre || 'Sin asignar',
        estado: 'Completada',
        metodoPago: nuevaVenta.usarSaldoAFavor ? `${nuevaVenta.metodoPago} (Saldo aplicado)` : nuevaVenta.metodoPago,
        garantiaMeses: nuevaVenta.garantiaMeses,
        productosDetalle: productosActuales,
        serviciosDetalle: tieneServicios
          ? serviciosAgregados.map((servicioAgregado) => ({
            id: servicioAgregado.id,
            nombre: servicioAgregado.nombre.startsWith('[PAQUETE] ')
              ? servicioAgregado.nombre.replace('[PAQUETE] ', '')
              : servicioAgregado.nombre,
            precio: servicioAgregado.precio,
            cantidad: servicioAgregado.cantidad
          }))
          : []
      };

      console.log('🔍 VentasPage - ventaData before service call:', ventaData);

      const nuevaVentaCreada = await ventaService.createVenta(ventaData);

      // Restar stock de los productos vendidos
      for (const p of productosActuales) {
        await productoService.adjustStock(Number(p.id), p.cantidad, 'decrement', 'ventas');
      }

      // Ajustar saldo a favor localmente si se usó
      if (nuevaVenta.usarSaldoAFavor && nuevaVenta.clienteId) {
        const clienteSel = clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId));
        const saldoDisponible = clienteSel?.saldoAFavor || 0;
        const totalSinSaldo = subtotal + 0 - descuento;
        const montoUsado = Math.min(totalSinSaldo, saldoDisponible);
        if (montoUsado > 0) {
          let persistOk = true;
          // Crear un registro de "consumo de saldo" como devolución negativa para persistir el ajuste
          try {
            await devolucionService.createDevolucion({
              ventaId: Number(nuevaVentaCreada.id || nuevaVentaCreada.numeroVenta || numeroVenta),
              productoId: (productosActuales[0]?.id ? Number(productosActuales[0].id) : 0),
              servicioId: undefined,
              clienteId: Number(nuevaVenta.clienteId),
              cantidad: 0,
              motivoCategoria: 'ConsumoSaldo',
              motivoDetalle: `Consumo de saldo por venta ${nuevaVentaCreada.numeroVenta || numeroVenta}`,
              montoDevuelto: 0,
              saldoAFavor: -Math.abs(montoUsado),
              usuarioId: Number(user.id),
              observaciones: 'Ajuste automático al usar saldo a favor en venta'
            });
          } catch (e) {
            console.warn('No se pudo registrar consumo de saldo a favor en devoluciones:', e);
            persistOk = false;
          }
          setClientesAPI(prev => prev.map((c: any) => {
            if (Number(c.id) === Number(nuevaVenta.clienteId)) {
              const nuevoSaldo = Math.max(0, Number((c as any).saldoAFavor || 0) - montoUsado);
              return { ...c, saldoAFavor: nuevoSaldo };
            }
            return c;
          }));
          // Recargar datos; si la persistencia falló, re-aplicar el ajuste local después de recargar
          await cargarVentas();
          if (!persistOk) {
            setClientesAPI(prev => prev.map((c: any) => {
              if (Number(c.id) === Number(nuevaVenta.clienteId)) {
                const nuevoSaldo = Math.max(0, Number((c as any).saldoAFavor || 0) - montoUsado);
                return { ...c, saldoAFavor: nuevoSaldo };
              }
              return c;
            }));
          }
        }
      }
      // Recargar datos generales si no se recargó arriba
      if (!(nuevaVenta.usarSaldoAFavor && nuevaVenta.clienteId)) {
        await cargarVentas();
      }

      // Si la API no expande relaciones al crear, preservar datos visibles del formulario
      const ventaConFallback = {
        ...nuevaVentaCreada,
        cliente:
          normalizeCliente(nuevaVentaCreada.cliente) === 'Cliente'
            ? (clienteSeleccionado?.nombre || normalizeCliente(nuevaVentaCreada.cliente))
            : nuevaVentaCreada.cliente,
        clienteDocumento:
          (nuevaVentaCreada.clienteDocumento && String(nuevaVentaCreada.clienteDocumento).trim() !== '')
            ? nuevaVentaCreada.clienteDocumento
            : (clienteSeleccionado?.documento || ''),
        barbero:
          (nuevaVenta.barberoId === null || nuevaVenta.barberoId === undefined)
            ? 'Sin asignar'
            : (
              normalizeBarbero(nuevaVentaCreada.barbero) === 'Sin asignar'
                ? (barberoSeleccionadoData ? `${barberoSeleccionadoData.nombre} ${barberoSeleccionadoData.apellido || ''}`.trim() : 'Sin asignar')
                : nuevaVentaCreada.barbero
            )
      };

      // Actualizar el estado local con la nueva venta
      setVentas([ventaConFallback, ...ventas]);

      // Resetear formulario
      setNuevaVenta({
        ...inicialNuevaVenta,
        fechaCreacion: generateCurrentDate(),
      });
      setCantidadProducto(0);
      setCantidadProductoInput('');
      setPorcentajeDescuentoInput('');
      setTarjetaProductoInputs({});
      setTarjetaServicioInputs({});
      setServiciosAgregados([]);
      setIsDialogOpen(false);

      created("Venta creada ✔️", `La venta #${numeroVenta} ha sido registrada exitosamente por ${formatCurrency(total)}.`);
    } catch (error: any) {
      console.error('Error creando venta:', error);
      const errorMessage = error?.message || 'Error desconocido al crear la venta';
      toast.error(`Error al crear la venta: ${errorMessage}`);
    }
  };

  const handleAnularVenta = (ventaId: number) => {
    setVentas(ventas.map(venta =>
      venta.id === ventaId
        ? { ...venta, estado: "Anulada" }
        : venta
    ));
    deleted("Venta anulada ✔️", `La venta ${ventaId} ha sido anulada exitosamente. El estado se ha actualizado en el sistema.`);
  };

  const handleToggleEstado = async (venta: Venta) => {
    // Solo permitir cambios entre "Completada" y "Anulada"
    // Si la venta está anulada, no se puede cambiar a completada
    if (venta.estado === 'Anulada') {
      toast.error("No es posible activar una venta anulada", {
        style: {
          background: 'var(--color-gray-darkest)',
          border: '1px solid #DC2626',
          color: 'var(--color-white-primary)',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: 'rgba(0, 0, 0, 0.5) 0px 4px 12px'
        },
        icon: '🚫',
        duration: 4000,
        description: 'Una vez anulada, una venta no puede ser reactivada por políticas de seguridad.'
      });
      return;
    }

    // Solo permitir cambiar de "Completada" a "Anulada"
    const nuevoEstado = 'Anulada';
    const accion = 'anular';

    const clienteStr = normalizeCliente(venta.cliente);
    confirmEditAction(
      `${venta.numeroVenta} - ${clienteStr}`,
      async () => {
        try {
          await ventaService.anularVenta(venta.id);

          // Revertir el stock de los productos vendidos
          if (venta.productosDetalle && Array.isArray(venta.productosDetalle)) {
            for (const p of venta.productosDetalle) {
              const pId = Number((p as any).id || (p as any).productoId || (p as any).ProductoId);
              if (!isNaN(pId)) {
                await productoService.adjustStock(pId, p.cantidad, 'increment', 'ventas');
              }
            }
          }

          // Restaurar saldo a favor si esta venta había consumido saldo (anular devoluciones negativas ligadas a la venta)
          try {
            const devs = await devolucionService.getDevoluciones();
            const consumoDevs = (devs || []).filter((d: any) => {
              const estado = String(d.estado || '').toLowerCase();
              const esEstadoValido = estado === 'completada' || estado === 'activo' || estado === 'procesado';
              return Number(d.ventaId) === Number(venta.id) && Number(d.saldoAFavor) < 0 && esEstadoValido;
            });
            let montoRestaurado = 0;
            for (const d of consumoDevs) {
              await devolucionService.updateDevolucionStatus(Number(d.id), 'Anulado');
              montoRestaurado += Math.abs(Number(d.saldoAFavor) || 0);
            }
            if (montoRestaurado > 0 && venta.clienteId) {
              setClientesAPI(prev => prev.map((c: any) => {
                if (Number(c.id) === Number(venta.clienteId)) {
                  const nuevoSaldo = Number((c as any).saldoAFavor || 0) + montoRestaurado;
                  return { ...c, saldoAFavor: nuevoSaldo };
                }
                return c;
              }));
            }
          } catch (e) {
            console.warn('No se pudo restaurar saldo a favor asociado a la venta anulada:', e);
          }

          // Actualizar estado local
          setVentas(prev => prev.map(v =>
            v.id === venta.id
              ? { ...v, estado: nuevoEstado }
              : v
          ));
          // Recargar datos para recalcular saldos
          cargarVentas();

          edited("Venta anulada ✔️", `La venta ${venta.numeroVenta} ha sido anulada exitosamente.`);
        } catch (error: any) {
          console.error('Error anulando venta:', error);
          toast.error('Error al anular la venta. Por favor, intenta nuevamente.');
        }
      },
      {
        confirmTitle: `Confirmar ${accion.charAt(0).toUpperCase() + accion.slice(1)} Venta`,
        confirmMessage: `¿Estás seguro de que deseas ${accion} la venta "${venta.numeroVenta}" del cliente "${clienteStr}"?`,
        successTitle: `¡Venta ${nuevoEstado.toLowerCase()}a exitosamente!`,
        successMessage: `La venta ha sido ${nuevoEstado.toLowerCase()}ada correctamente en el sistema.`,
        requireInput: false
      }
    );
  };

  const generateVentaPDF = (venta: any) => {
    // Crear el contenido HTML del PDF con la misma estructura del modal de detalle
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Detalle de Venta ${venta.id}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #fff;
            color: #000;
            line-height: 1.5;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #d8b081;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .company-name {
            font-size: 28px;
            font-weight: bold;
            color: #d8b081;
            margin-bottom: 10px;
          }
          .invoice-title {
            font-size: 24px;
            color: #333;
            margin-bottom: 5px;
          }
          .invoice-subtitle {
            font-size: 14px;
            color: #666;
          }
          .section {
            margin-bottom: 25px;
            border: 1px solid #d8b081;
            border-radius: 8px;
            padding: 15px;
            background-color: #f9f9f9;
          }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #d8b081;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid #d8b081;
            padding-bottom: 8px;
          }
          .section-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .field {
            margin-bottom: 12px;
          }
          .field-label {
            font-weight: bold;
            color: #333;
            margin-bottom: 5px;
            font-size: 14px;
          }
          .field-value {
            color: #666;
            padding: 8px 12px;
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }
          .products-section, .services-section {
            margin-bottom: 20px;
          }
          .item-card {
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .item-details {
            flex: 1;
          }
          .item-name {
            font-weight: bold;
            color: #333;
            margin-bottom: 4px;
          }
          .item-description {
            font-size: 12px;
            color: #666;
          }
          .item-price {
            font-weight: bold;
            color: #d8b081;
            font-size: 16px;
          }
          .totals-section {
            background-color: #f8f9fa;
            border: 2px solid #d8b081;
            border-radius: 8px;
            padding: 20px;
            margin-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 4px 0;
            font-size: 14px;
          }
          .total-label {
            color: #666;
          }
          .total-value {
            font-weight: bold;
            color: #333;
          }
          .final-total {
            border-top: 2px solid #d8b081;
            padding-top: 12px;
            margin-top: 12px;
            font-size: 18px;
          }
          .final-total .total-value {
            color: #d8b081;
            font-size: 20px;
            font-weight: bold;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 12px;
            color: white;
            background-color: ${venta.estado === 'Completada' ? '#10B981' : venta.estado === 'Anulada' ? '#DC2626' : '#d8b081'};
          }
          .additional-info {
            background-color: #f5f5f5;
            border: 1px solid #d8b081;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .empty-state {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 20px;
            background-color: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 6px;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 12px;
            border-top: 1px solid #d8b081;
            padding-top: 20px;
          }
          @media print {
            body { margin: 0; padding: 15px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">BARBERÍA ELEGANTE</div>
          <div class="invoice-title">Detalles de Venta ${venta.id}</div>
          <div class="invoice-subtitle">Información completa de la transacción</div>
        </div>

        <!-- Información básica -->
        <div class="section">
          <div class="section-grid">
            <div class="field">
              <div class="field-label">📋 Número de Venta</div>
              <div class="field-value">${venta.id}</div>
            </div>
            <div class="field">
              <div class="field-label">📅 Fecha de Registro</div>
              <div class="field-value">${formatDate(venta.fecha)}</div>
            </div>
            <div class="field">
              <div class="field-label">👤 Cliente</div>
              <div class="field-value">${normalizeCliente(venta.cliente)}</div>
            </div>
            <div class="field">
              <div class="field-label">💳 Método de Pago</div>
              <div class="field-value">${venta.metodoPago}</div>
            </div>
          </div>
        </div>

        <!-- Productos -->
        <div class="section">
          <div class="section-title">🛍️ Productos</div>
          <div class="products-section">
            ${venta.productosDetalle && venta.productosDetalle.length > 0 ?
        venta.productosDetalle.map((producto: any) => `
                <div class="item-card">
                  <div class="item-details">
                    <div class="item-name">${producto.nombre}</div>
                    <div class="item-description">Cantidad: ${producto.cantidad} × ${formatCurrency(producto.precio)} = ${formatCurrency(producto.cantidad * producto.precio)}</div>
                  </div>
                  <div class="item-price">${formatCurrency(producto.cantidad * producto.precio)}</div>
                </div>
              `).join('') :
        '<div class="empty-state">Ningún producto agregado</div>'
      }
          </div>
        </div>

        <!-- Servicios -->
        <div class="section">
          <div class="section-title">✂️ Servicios</div>
          <div class="services-section">
            ${venta.serviciosDetalle && venta.serviciosDetalle.length > 0 ?
        venta.serviciosDetalle.map((servicio: any) => `
                <div class="item-card">
                  <div class="item-details">
                    <div class="item-name">${servicio.nombre}</div>
                    <div class="item-description">Precio del servicio</div>
                  </div>
                  <div class="item-price">${formatCurrency(servicio.precio)}</div>
                </div>
              `).join('') :
        '<div class="empty-state">Ningún servicio registrado</div>'
      }
          </div>
        </div>

        <!-- Porcentajes -->
        <div class="section">
          <div class="section-title">📊 IVA (%) & Descuento (%)</div>
          <div class="section-grid">
            <div class="field">
              <div class="field-label">📈 IVA (%)</div>
              <div class="field-value">19</div>
            </div>
            <div class="field">
              <div class="field-label">📉 Descuento (%)</div>
              <div class="field-value">${venta.descuento > 0 ? Math.round((venta.descuento / venta.subtotal) * 100) : "0"}</div>
            </div>
          </div>
        </div>

        <!-- Resumen de Totales -->
        <div class="section">
          <div class="section-title">🧮 Resumen de Totales</div>
          <div class="totals-section">
            <div class="total-row">
              <span class="total-label">Subtotal:</span>
              <span class="total-value">${formatCurrency(venta.subtotal)}</span>
            </div>
            <div class="total-row">
              <span class="total-label">IVA (19%):</span>
              <span class="total-value">${formatCurrency(venta.iva)}</span>
            </div>
            ${venta.descuento > 0 ? `
            <div class="total-row">
              <span class="total-label">Descuento:</span>
              <span class="total-value" style="color: #DC2626;">-${formatCurrency(venta.descuento)}</span>
            </div>
            ` : ''}
            <div class="total-row final-total">
              <span class="total-label">Total:</span>
              <span class="total-value">${formatCurrency(venta.total)}</span>
            </div>
          </div>
        </div>

        <!-- Información Adicional -->
        <div class="additional-info">
          <div class="section-title">📄 Información Adicional</div>
          <div class="info-grid">
            <div>
              <div class="field-label">Barbero asignado:</div>
              <div style="color: #333; font-weight: 500; margin-top: 5px;">${normalizeBarbero(venta.barbero)}</div>
            </div>
            <div>
              <div class="field-label">Estado de la venta:</div>
              <div style="margin-top: 8px;">
                <span class="status-badge">${venta.estado}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="footer">
          <p><strong>Barbería Elegante</strong> - Sistema de Gestión Integral</p>
          <p>Documento generado automáticamente el ${new Date().toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}</p>
          <p style="margin-top: 10px; color: #d8b081;">
            <strong>¡Gracias por preferirnos!</strong>
          </p>
        </div>
      </body>
      </html>
    `;

    // Crear y abrir una nueva ventana con el contenido del PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Esperar a que se cargue el contenido y luego imprimir
      printWindow.onload = () => {
        printWindow.print();
        // Opcional: cerrar la ventana después de imprimir
        // printWindow.close();
      };
    }

    created("PDF generado ✔️", `La factura de la venta ${venta.id} ha sido generada y está lista para imprimir.`);
  };

  const totalVentas = ventas.reduce((sum, venta) => sum + venta.total, 0);
  const ventasCompletadas = ventas.filter(v => v.estado === "Completada").length;
  const ventasHoy = ventas.filter(v => formatDate(v.fecha) === formatDate(new Date())).length;

  return (
    <>
      {/* Header */}
      <header className="bg-black-primary border-b border-gray-dark px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white-primary">Gestión de Ventas</h1>
            <p className="text-sm text-gray-lightest mt-1">Control y seguimiento de transacciones</p>
          </div>

        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 bg-black-primary">
        {/* Estado de carga */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-primary mx-auto mb-4"></div>
              <p className="text-gray-lightest">Cargando ventas...</p>
            </div>
          </div>
        )}

        {/* Estado de error */}
        {error && !loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-red-400 mb-4">
                <Ban className="w-12 h-12 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-white-primary mb-2">Error al cargar las ventas</h3>
              <p className="text-sm text-gray-lightest mb-4">{error}</p>
              <button
                onClick={cargarVentas}
                className="elegante-button-primary"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}

        {/* Contenido principal cuando no hay error ni carga */}
        {!loading && !error && (
          <>
            {/* Stats Cards */}
            <div style={{ display: 'none' }} className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="elegante-card text-center">
                <DollarSign className="w-8 h-8 text-orange-primary mx-auto mb-2" />
                <h4 className="text-2xl font-bold text-white-primary mb-1">${formatCurrency(totalVentas)}</h4>
                <p className="text-gray-lightest text-sm">Total Ventas</p>
              </div>
              <div className="elegante-card text-center">
                <ShoppingCart className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <h4 className="text-2xl font-bold text-white-primary mb-1">{ventasCompletadas}</h4>
                <p className="text-gray-lightest text-sm">Completadas</p>
              </div>
              <div className="elegante-card text-center">
                <Calendar className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <h4 className="text-2xl font-bold text-white-primary mb-1">{ventasHoy}</h4>
                <p className="text-gray-lightest text-sm">Ventas Hoy</p>
              </div>
              <div className="elegante-card text-center">
                <Package className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <h4 className="text-2xl font-bold text-white-primary mb-1">
                  ${formatCurrency(Math.round(totalVentas / ventas.length))}
                </h4>
                <p className="text-gray-lightest text-sm">Promedio</p>
              </div>
            </div>

            {/* Sección Principal */}
            <div className="elegante-card">
              {/* Barra de Controles */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-dark">
                {/* Lado izquierdo: botón + búsqueda + filtro de barbero */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Botón Nueva Venta */}
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <button
                        className="elegante-button-primary gap-2 flex items-center"
                        onClick={() => {
                          setShowVentaFormErrors(false);
                          setShowAddProductoErrors(false);
                          setShowAddServicioErrors(false);
                          setNuevaVenta({
                            ...inicialNuevaVenta,
                            fechaCreacion: generateCurrentDate()
                          });
                          setCantidadProducto(0);
                          setCantidadProductoInput('');
                          setPorcentajeDescuentoInput('');
                          setTarjetaProductoInputs({});
                          setTarjetaServicioInputs({});
                          setServiciosAgregados([]);
                          setClientSearchTerm('');
                          setShowClientResults(false);
                          setProductSearchTerm('');
                          setShowProductResults(false);
                          setServiceSearchTerm('');
                          setShowServiceResults(false);
                        }}
                      >
                        <Plus className="w-4 h-4" />
                        Nueva Venta
                      </button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="text-white-primary flex items-center gap-2">
                          <Receipt className="w-5 h-5 text-orange-primary" />
                          Registrar Nueva Venta
                        </DialogTitle>
                        <DialogDescription className="text-gray-lightest">
                          Completa la información de la transacción
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6 pt-4">
                        {/* Información Principal */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-white-primary flex items-center gap-2">
                              <Hash className="w-4 h-4 text-orange-primary" />
                              Número de Venta
                            </Label>
                            <Input
                              value={numeroVenta.toString().padStart(3, "0")}
                              disabled
                              className="elegante-input bg-gray-medium"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white-primary flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-orange-primary" />
                              Fecha de Registro
                            </Label>
                            <Input
                              value={formatDate(nuevaVenta.fechaCreacion)}
                              disabled
                              readOnly
                              className="elegante-input bg-gray-medium"
                            />
                          </div>
                        </div>

                        {/* Cliente y Método de Pago */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2 relative">
                            <Label className="text-white-primary flex items-center gap-2">
                              <User className="w-4 h-4 text-orange-primary" />
                              Buscar Cliente por Nombre o Documento *
                            </Label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-lighter pointer-events-none z-10" />
                              <Input
                                placeholder="Escribe para buscar un cliente..."
                                value={clientSearchTerm}
                                onChange={(e) => {
                                  setClientSearchTerm(e.target.value);
                                  setShowClientResults(true);
                                }}
                                onFocus={() => setShowClientResults(true)}
                                className={`elegante-input pl-11 w-full ${showVentaFormErrors && !nuevaVenta.clienteId ? `border-red-500 ring-1 ring-red-500 ${shakeClass}` : ''}`}
                              />

                              {showClientResults && clientSearchTerm.trim() !== "" && (
                                <div className="absolute z-50 w-full mt-2 bg-gray-darkest border border-gray-dark rounded-xl shadow-2xl max-h-80 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in duration-200">
                                  {(() => {
                                    const query = normalizeSearchText(clientSearchTerm);
                                    const filteredResults = clientesDisponibles.filter(c => {
                                      const searchableText = normalizeSearchText([
                                        c.id,
                                        c.nombre,
                                        c.documento
                                      ].join(' '));
                                      return searchableText.includes(query);
                                    }).slice(0, 50);

                                    if (filteredResults.length === 0) {
                                      return (
                                        <div className="p-4 text-center text-gray-lightest italic">
                                          No se encontraron clientes que coincidan.
                                        </div>
                                      );
                                    }

                                    return filteredResults.map((cliente) => (
                                      <div
                                        key={cliente.id}
                                        onClick={() => {
                                          setNuevaVenta({
                                            ...nuevaVenta,
                                            clienteId: cliente.id,
                                            clienteDocumento: cliente.documento
                                          });
                                          setClientSearchTerm(`${cliente.nombre}${cliente.documento ? ` — ${cliente.documento}` : ''}`);
                                          setShowClientResults(false);
                                        }}
                                        className="p-3 border-b border-gray-dark hover:bg-gray-dark transition-colors cursor-pointer group"
                                      >
                                        <div className="flex justify-between items-center">
                                          <div>
                                            <p className="text-white-primary font-medium text-sm group-hover:text-orange-secondary transition-colors">
                                              {cliente.nombre}
                                            </p>
                                            <p className="text-[10px] text-gray-lightest">{cliente.documento || 'Sin documento'}</p>
                                          </div>
                                          <div className="text-right">
                                            <p className="text-[9px] text-gray-lightest uppercase tracking-widest leading-none mb-1">Saldo Disponible</p>
                                            <p className={`text-xs font-bold ${cliente.saldoAFavor > 0 ? 'text-green-400' : 'text-gray-lightest'}`}>
                                              ${formatCurrency(cliente.saldoAFavor)}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              )}
                            </div>
                            {showVentaFormErrors && !nuevaVenta.clienteId && (
                              <p className="text-xs text-red-400 mt-1">Debes seleccionar un cliente del buscador.</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white-primary flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-orange-primary" />
                              Método de Pago *
                            </Label>
                            <Select
                              value={nuevaVenta.metodoPago}
                              onValueChange={(value) => {
                                const saldo = clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0;
                                setNuevaVenta({ ...nuevaVenta, metodoPago: value, usarSaldoAFavor: value === 'Saldo' && saldo > 0 });
                              }}
                            >
                              <SelectTrigger className={`elegante-input ${showVentaFormErrors && !nuevaVenta.metodoPago ? `border-red-500 ring-1 ring-red-500 ${shakeClass}` : ''}`}>
                                <SelectValue placeholder="Selecciona el método de pago" />
                              </SelectTrigger>
                              <SelectContent className="elegante-card">
                                <SelectItem value="Efectivo">Efectivo</SelectItem>
                                <SelectItem value="Tarjeta">Tarjeta</SelectItem>
                                <SelectItem value="Transferencia">Transferencia</SelectItem>
                                <SelectItem
                                  value="Saldo"
                                  disabled={(clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0) <= 0}
                                >
                                  Saldo
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {showVentaFormErrors && !nuevaVenta.metodoPago && (
                              <p className="text-xs text-red-400">Este campo es obligatorio.</p>
                            )}
                            <div className="space-y-1 mt-2">
                              <Label className="text-white-primary flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-orange-primary" />
                                SaldoDisp.
                              </Label>
                              <Input
                                value={`$${formatCurrency(clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0)}`}
                                disabled
                                readOnly
                                className="elegante-input bg-gray-medium"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Saldo a Favor */}
                        {nuevaVenta.clienteId && (
                          <div className="bg-gray-darker p-3 rounded-lg border border-gray-dark flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor ? 'bg-orange-primary/10' : 'bg-gray-dark'}`}>
                                <DollarSign className={`w-5 h-5 ${clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor ? 'text-orange-primary' : 'text-gray-lightest'}`} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-white-primary">Saldo a Favor del Cliente</p>
                                <p className="text-xs text-gray-lightest">
                                  Disponible: <span className="text-orange-primary font-bold">${formatCurrency(clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0)}</span>
                                </p>
                              </div>
                            </div>
                            {(clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0) > 0 && (
                              <div className="flex items-center gap-2">
                                <Label htmlFor="usar-saldo" className="text-sm text-gray-lightest cursor-pointer">Usar saldo en esta venta</Label>
                                <input
                                  id="usar-saldo"
                                  type="checkbox"
                                  checked={nuevaVenta.usarSaldoAFavor}
                                  onChange={(e) => setNuevaVenta({ ...nuevaVenta, usarSaldoAFavor: e.target.checked })}
                                  className="w-5 h-5 rounded border-gray-dark bg-gray-dark text-orange-primary focus:ring-orange-primary transition-colors cursor-pointer"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Descuento y Garantía */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-white-primary flex items-center gap-2">
                              <Calculator className="w-4 h-4 text-orange-primary" />
                              Porcentaje Descuento (%)
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={porcentajeDescuentoInput}
                              onChange={(e) => {
                                if (e.target.value.length <= 5) {
                                  handlePorcentajeDescuentoInputChange(e.target.value);
                                }
                              }}
                              className="elegante-input"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-white-primary flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-orange-primary" />
                                Garantía
                              </div>
                              <span className="text-[10px] text-gray-500 font-medium bg-gray-dark/30 px-2 py-0.5 rounded-full border border-gray-dark/50">
                                15 días (fijo)
                              </span>
                            </Label>
                            <Input value="15 días (fijo)" disabled className="elegante-input bg-gray-medium cursor-not-allowed" />
                          </div>
                        </div>

                        {/* Agregar Productos */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-white-primary">Agregar Productos</h3>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2 relative">
                              <Label className="text-white-primary flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-orange-primary" />
                                Buscar Producto *
                              </Label>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-lighter pointer-events-none z-10" />
                                <Input
                                  placeholder="Escribe el nombre..."
                                  value={productSearchTerm}
                                  onChange={(e) => {
                                    setProductSearchTerm(e.target.value);
                                    setShowProductResults(true);
                                  }}
                                  onFocus={() => setShowProductResults(true)}
                                  className={`elegante-input pl-11 w-full ${showProductoSelectorError ? `border-red-500 ring-1 ring-red-500 ${shakeClass}` : ''}`}
                                />

                                {showProductResults && productSearchTerm.trim() !== "" && (
                                  <div className="absolute z-50 w-full mt-2 bg-gray-darkest border border-gray-dark rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in duration-200">
                                    {(() => {
                                      const query = normalizeSearchText(productSearchTerm);
                                      const filteredResults = productosAPI
                                        .filter(p =>
                                          normalizeSearchText(p.nombre).includes(query)
                                        )
                                        .filter(p => {
                                          const stock = Number((p as any).stockVentas ?? (p as any).stock ?? 0);
                                          const precioNum = Number((p as any).precio ?? (p as any).precioBase ?? 0);
                                          return stock > 0 && precioNum > 0;
                                        })
                                        .slice(0, 20);

                                      if (filteredResults.length === 0) {
                                        return (
                                          <div className="p-4 text-center text-gray-lightest italic">
                                            Sin resultados.
                                          </div>
                                        );
                                      }

                                      return filteredResults.map((producto) => (
                                        <div
                                          key={producto.id}
                                          onClick={() => {
                                            setProductoSeleccionado(producto.id.toString());
                                            setProductSearchTerm(producto.nombre);
                                            setShowProductResults(false);
                                            if (showAddProductoErrors) setShowAddProductoErrors(false);
                                          }}
                                          className="p-3 border-b border-gray-dark hover:bg-gray-dark transition-colors cursor-pointer group"
                                        >
                                          <div className="flex justify-between items-center">
                                            <div>
                                              <p className="text-white-primary font-medium text-sm group-hover:text-orange-secondary transition-colors">
                                                {producto.nombre}
                                              </p>
                                              <p className="text-[10px] text-gray-lightest">${formatCurrency(producto.precio || producto.precioBase)}</p>
                                            </div>
                                            <div className="text-right">
                                              <p className="text-[9px] text-gray-lightest uppercase tracking-widest leading-none mb-1">Stock</p>
                                              <p className={`text-xs font-bold ${producto.stockVentas > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {producto.stockVentas}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </div>
                              {showProductoSelectorError && (
                                <p className="text-xs text-red-400">Selecciona un producto del buscador o agrega un servicio.</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-white-primary flex items-center gap-2">
                                <Hash className="w-4 h-4 text-orange-primary" />
                                Cantidad
                              </Label>
                              <Input
                                type="number"
                                value={cantidadProductoInput}
                                onChange={(e) => {
                                  if (e.target.value.length <= 10) {
                                    handleCantidadProductoInputChange(e.target.value);
                                  }
                                }}
                                className={`elegante-input no-spin ${showCantidadProductoError ? `border-red-500 ring-1 ring-red-500 ${shakeClass}` : ''}`}
                                min="1"
                              />
                              <div className="flex justify-start mt-1">
                                <span className="text-xs text-gray-500 font-medium">
                                  {cantidadProductoInput.length}/10 caracteres
                                </span>
                              </div>
                              {showCantidadProductoError && !isStockExceeded && (
                                <p className="text-xs text-red-400">Ingresa una cantidad válida.</p>
                              )}
                              {isStockExceeded && (
                                <p className="text-xs text-red-500 font-bold animate-pulse mt-1">
                                  ⚠️ Se ha excedido la cantidad de productos en el stock.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label className="text-white-primary">ㅤ</Label>
                              <button
                                onClick={agregarProducto}
                                className="elegante-button-primary w-full"
                              >
                                Agregar producto
                              </button>
                            </div>
                          </div>

                          {/* Lista de Productos Agregados */}
                          {nuevaVenta.productos && nuevaVenta.productos.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-md font-medium text-white-primary">Productos Agregados:</h4>
                              <div className="space-y-2 max-h-52 overflow-y-auto">
                                {nuevaVenta.productos.map((producto, index) => (
                                  <div key={index} className="bg-gray-darker rounded-lg px-3 py-2.5 border-l-2 border-orange-primary/20">
                                    <div className="flex items-center gap-4 flex-nowrap min-w-0">
                                      <div className="shrink-0 w-6" aria-hidden />
                                      <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden bg-gray-dark border border-gray-dark flex items-center justify-center">
                                        <ImageRenderer
                                          url={producto.imagen}
                                          alt={producto.nombre}
                                          className="w-full h-full border-0 bg-transparent"
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1 shrink flex items-center justify-center">
                                        <span className="text-white-primary font-semibold text-base truncate block text-center w-full">
                                          {producto.nombre}
                                        </span>
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0">
                                        <label className="text-[11px] text-gray-400 font-normal">Cantidad</label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={getTarjetaProductoInput(producto.id, 'cantidad', producto.cantidad)}
                                          onChange={(e) => onTarjetaProductoInputChange(producto.id, 'cantidad', e.target.value)}
                                          className="w-14 h-7 text-xs text-center tabular-nums elegante-input no-spin py-0 px-1.5"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0">
                                        <label className="text-[11px] text-gray-400 font-normal">Precio</label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={getTarjetaProductoInput(producto.id, 'precio', producto.precio)}
                                          onChange={(e) => onTarjetaProductoInputChange(producto.id, 'precio', e.target.value)}
                                          className="w-20 h-7 text-xs text-right tabular-nums elegante-input no-spin py-0 px-1.5"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0 justify-center">
                                        <label className="text-[11px] text-gray-400 font-normal">Subt.</label>
                                        <span className="text-orange-primary font-semibold text-xs tabular-nums leading-7">
                                          ${formatCurrency(producto.precio * producto.cantidad)}
                                        </span>
                                      </div>

                                      <button
                                        onClick={() => eliminarProducto(producto.id)}
                                        className="shrink-0 p-2 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
                                        title="Eliminar producto"
                                        type="button"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {showVentaFormErrors && noItemsAgregados && (
                          <p className="text-xs text-red-400">Debes agregar al menos un producto o servicio.</p>
                        )}

                        {/* Agregar Servicios */}
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold text-white-primary">Agregar Servicios</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Barbero (opcional) */}
                            <div className="space-y-2">
                              <Label className="text-white-primary flex items-center gap-2">
                                <User className="w-4 h-4 text-orange-primary" />
                                Barbero (opcional)
                              </Label>
                              <Select
                                value={nuevaVenta.barberoId?.toString() || VALOR_SIN_BARBERO}
                                onValueChange={(value) => {
                                  if (value === VALOR_SIN_BARBERO) {
                                    setNuevaVenta({ ...nuevaVenta, barberoId: null, barberoNombre: "Sin asignar" });
                                  } else {
                                    const id = parseInt(value);
                                    const barbero = barberosAPI.find(b => b.id === id);
                                    setNuevaVenta({
                                      ...nuevaVenta,
                                      barberoId: id,
                                      barberoNombre: barbero ? `${barbero.nombre} ${barbero.apellido || ''}`.trim() : ""
                                    });
                                  }
                                }}
                              >
                                <SelectTrigger className="elegante-input bg-gray-darker border-gray-dark">
                                  <SelectValue placeholder="Sin barbero asignado" />
                                </SelectTrigger>
                                <SelectContent className="bg-gray-darkest border border-gray-dark text-white-primary">
                                  <SelectItem value={VALOR_SIN_BARBERO}>Sin barbero</SelectItem>
                                  {barberosAPI.map((barbero) => (
                                    <SelectItem key={barbero.id} value={barbero.id.toString()}>
                                      {barbero.nombre} {barbero.apellido}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Servicio con buscador */}
                            <div className="space-y-2 relative">
                              <Label className="text-white-primary flex items-center gap-2">
                                <Scissors className="w-4 h-4 text-orange-primary" />
                                Buscar Servicio
                              </Label>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-lighter pointer-events-none z-10" />
                                <Input
                                  placeholder="Escribe el nombre..."
                                  value={serviceSearchTerm}
                                  onChange={(e) => {
                                    setServiceSearchTerm(e.target.value);
                                    setShowServiceResults(true);
                                  }}
                                  onFocus={() => setShowServiceResults(true)}
                                  className={`elegante-input pl-11 w-full ${showServicioSelectorError ? `border-red-500 ring-1 ring-red-500 ${shakeClass}` : ''}`}
                                />

                                {showServiceResults && serviceSearchTerm.trim() !== "" && (
                                  <div className="absolute z-50 w-full mt-2 bg-gray-darkest border border-gray-dark rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in duration-200">
                                    {(() => {
                                      const query = normalizeSearchText(serviceSearchTerm);
                                      const filteredResults = serviciosDisponibles.filter(s =>
                                        normalizeSearchText(s).includes(query)
                                      ).slice(0, 20);

                                      if (filteredResults.length === 0) {
                                        return (
                                          <div className="p-4 text-center text-gray-lightest italic">
                                            Sin resultados.
                                          </div>
                                        );
                                      }

                                      return filteredResults.map((servicioNom, idx) => (
                                        <div
                                          key={idx}
                                          onClick={() => {
                                            setServicioSeleccionado(servicioNom);
                                            setServiceSearchTerm(servicioNom);
                                            setShowServiceResults(false);
                                            if (showAddServicioErrors) setShowAddServicioErrors(false);
                                          }}
                                          className="p-3 border-b border-gray-dark hover:bg-gray-dark transition-colors cursor-pointer group"
                                        >
                                          <p className="text-white-primary font-medium text-sm group-hover:text-orange-secondary transition-colors text-center">
                                            {servicioNom}
                                          </p>
                                        </div>
                                      ));
                                    })()}
                                  </div>
                                )}
                              </div>
                              {showServicioSelectorError && (
                                <p className="text-xs text-red-400">Selecciona un servicio del buscador o agrega un producto.</p>
                              )}
                            </div>

                            {/* Botón agregar servicio */}
                            <div className="space-y-2">
                              <Label className="text-white-primary">ㅤ</Label>
                              <button
                                onClick={agregarServicio}
                                className="elegante-button-primary w-full"
                              >
                                Agregar Servicio
                              </button>
                            </div>
                          </div>

                          {/* Lista de Servicios Agregados */}
                          {serviciosAgregados.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-md font-medium text-white-primary">Servicios Agregados:</h4>
                              <div className="space-y-2 max-h-52 overflow-y-auto">
                                {serviciosAgregados.map((servicio, index) => (
                                  <div key={index} className="bg-gray-darker rounded-lg px-3 py-2.5 border-l-2 border-orange-primary/20">
                                    <div className="flex items-center gap-4 flex-nowrap min-w-0">
                                      <div className="shrink-0 w-6" aria-hidden />
                                      <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden bg-gray-dark border border-gray-dark flex items-center justify-center">
                                        <ImageRenderer
                                          url={servicio.imagen}
                                          alt={servicio.nombre}
                                          className="w-full h-full border-0 bg-transparent"
                                        />
                                      </div>
                                      <div className="min-w-0 flex-1 shrink flex items-center justify-center">
                                        <span className="text-white-primary font-semibold text-base truncate block text-center w-full">
                                          {servicio.nombre}
                                        </span>
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0">
                                        <label className="text-[11px] text-gray-400 font-normal">Cantidad</label>
                                        <Input
                                          type="number"
                                          min={1}
                                          value={getTarjetaServicioInput(servicio.id, 'cantidad', servicio.cantidad)}
                                          onChange={(e) => onTarjetaServicioInputChange(servicio.id, 'cantidad', e.target.value)}
                                          className="w-14 h-7 text-xs text-center tabular-nums elegante-input no-spin py-0 px-1.5"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0">
                                        <label className="text-[11px] text-gray-400 font-normal">Precio</label>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={getTarjetaServicioInput(servicio.id, 'precio', servicio.precio)}
                                          onChange={(e) => onTarjetaServicioInputChange(servicio.id, 'precio', e.target.value)}
                                          className="w-20 h-7 text-xs text-right tabular-nums elegante-input no-spin py-0 px-1.5"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-0.5 shrink-0 justify-center">
                                        <label className="text-[11px] text-gray-400 font-normal">Subt.</label>
                                        <span className="text-orange-primary font-semibold text-xs tabular-nums leading-7">
                                          ${formatCurrency(servicio.precio * servicio.cantidad)}
                                        </span>
                                      </div>

                                      <button
                                        onClick={() => eliminarServicio(servicio.id)}
                                        className="shrink-0 p-2 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
                                        title="Eliminar servicio"
                                        type="button"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Resumen de Totales */}
                        {((nuevaVenta.productos && nuevaVenta.productos.length > 0) || serviciosAgregados.length > 0) && (
                          <div className="bg-gray-darker p-4 rounded-lg space-y-2">
                            <div className="flex justify-between text-gray-lightest">
                              <span>Subtotal:</span>
                              <span>${formatCurrency(calcularSubtotal())}</span>
                            </div>
                            {nuevaVenta.porcentajeDescuento > 0 && (
                              <div className="flex justify-between text-gray-lightest">
                                <span>Descuento ({nuevaVenta.porcentajeDescuento}%):</span>
                                <span>-${formatCurrency(calcularDescuento(calcularSubtotal()))}</span>
                              </div>
                            )}
                            {nuevaVenta.usarSaldoAFavor && (
                              <div className="flex justify-between text-green-400">
                                <span>Saldo a Favor usado:</span>
                                <span>-${formatCurrency(Math.min(calcularSubtotal() + calcularIva(calcularSubtotal()) - calcularDescuento(calcularSubtotal()), clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0))}</span>
                              </div>
                            )}
                            <hr className="border-gray-medium" />
                            <div className="flex justify-between text-white-primary font-bold text-lg">
                              <span>Total:</span>
                              <span className="text-orange-primary">${formatCurrency(calcularTotal())}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-dark">
                          <button
                            onClick={() => {
                              setIsDialogOpen(false);
                              setShowVentaFormErrors(false);
                              setShowAddProductoErrors(false);
                              setShowAddServicioErrors(false);
                              setTarjetaProductoInputs({});
                              setTarjetaServicioInputs({});
                              setProductSearchTerm('');
                              setShowProductResults(false);
                              setServiceSearchTerm('');
                              setShowServiceResults(false);
                            }}
                            className="elegante-button-secondary"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleCreateVenta}
                            className="elegante-button-primary"
                            disabled={
                              nuevaVenta.metodoPago === 'Saldo' &&
                              ((clientesDisponibles.find(c => c.id === Number(nuevaVenta.clienteId))?.saldoAFavor || 0) <= 0)
                            }
                          >
                            Registrar Venta
                          </button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <div className="flex items-center gap-4">
                    {/* Búsqueda */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-lighter pointer-events-none z-10" />
                      <Input
                        placeholder="Buscar por cualquier campo de la tabla..."
                        value={searchTerm}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="elegante-input pl-11 w-80"
                      />
                    </div>

                    {/* Filtro de barbero */}
                    <div className="flex items-center gap-2">
                      <Label className="text-gray-lightest text-sm flex items-center gap-1">
                        <User className="w-4 h-4 text-orange-primary" />
                        Barbero
                      </Label>
                      <Select
                        value={barberoSeleccionado}
                        onValueChange={(value) => {
                          setBarberoSeleccionado(value);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-52 elegante-input bg-gray-darker border-gray-dark">
                          <SelectValue placeholder="Todos los barberos" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-darkest border border-gray-dark text-white-primary">
                          <SelectItem value={VALOR_TODOS_BARBEROS}>Todos</SelectItem>
                          {barberosDisponibles.map((barbero) => (
                            <SelectItem key={barbero} value={barbero}>
                              {barbero}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Resumen oculto por requerimiento */}
                  {false && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {barberoSeleccionado !== VALOR_TODOS_BARBEROS && (
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                          <span className="px-3 py-1 rounded-full bg-gray-darker border border-gray-dark text-gray-lightest">
                            Total servicios:{" "}
                            <span className="text-orange-primary font-semibold">
                              ${formatCurrency(totalServiciosFiltrados)}
                            </span>
                          </span>
                          <span className="px-3 py-1 rounded-full bg-gray-darker border border-gray-dark text-gray-lightest">
                            60% Barbero:{" "}
                            <span className="text-green-400 font-semibold">
                              ${formatCurrency(totalBarbero)}
                            </span>
                          </span>
                          <span className="px-3 py-1 rounded-full bg-gray-darker border border-gray-dark text-gray-lightest">
                            40% Barbería:{" "}
                            <span className="text-blue-300 font-semibold">
                              ${formatCurrency(totalBarberia)}
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="text-xs sm:text-sm text-gray-lightest sm:ml-2">
                        Mostrando {displayedVentas.length} de {filteredVentas.length} ventas
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabla de Ventas */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-dark">
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">###</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Documento Cliente</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Nombre Cliente</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Total</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Fecha de Registro</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Estado</th>
                      <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedVentas.length > 0 ? displayedVentas.map((venta) => (
                      <tr key={venta.id} className="border-b border-gray-dark hover:bg-gray-darker transition-colors">
                        <td className="py-4 px-4 text-center">
                          <span className="text-gray-lighter">{venta.id}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="text-center">
                            <span className="text-gray-lighter">
                              {venta.clienteDocumento || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="text-center">
                            <span className="text-gray-lighter">
                              {normalizeCliente(venta.cliente)}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-gray-lighter font-bold">
                            ${(() => {
                              const sumDev = devoluciones
                                .filter((d) => {
                                  const motivoDet = String((d as any).motivoDetalle || '').toLowerCase();
                                  const motivoCat = String((d as any).motivo || (d as any).motivoCategoria || '').toLowerCase();
                                  const esConsumoSaldo = (motivoDet.includes('consumo') && motivoDet.includes('saldo')) || (motivoCat.includes('consumo') && motivoCat.includes('saldo'));
                                  const estado = String((d as any).estado || '').toLowerCase().trim();
                                  const noAnulada = estado !== 'anulada' && estado !== 'anulado';
                                  return Number((d as any).ventaId) === Number(venta.id) && noAnulada && !esConsumoSaldo;
                                })
                                .reduce((acc, d) => acc + (Number((d as any).monto) || 0), 0);
                              // Si hay devoluciones, ajustamos; si no, mostramos el total del backend (ya considera saldo a favor)
                              if (sumDev > 0) {
                                const adjSubtotal = Math.max(0, (Number(venta.subtotal) || 0) - sumDev);
                                const adjTotal = Math.max(0, adjSubtotal - (Number(venta.descuento) || 0));
                                return formatCurrency(adjTotal);
                              }
                              return formatCurrency(Number(venta.total) || 0);
                            })()}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="text-gray-lighter">{formatDate(venta.fecha)}</span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs ${getEstadoColor(venta.estado)}`}>
                            {venta.estado}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {venta.estado === 'Completada' && (
                              <button
                                onClick={() => handleToggleEstado(venta)}
                                className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                                title="Anular venta"
                              >
                                <Ban className="w-4 h-4 text-gray-lightest group-hover:text-red-400" />
                              </button>
                            )}
                            {venta.estado === 'Anulada' && (
                              <button
                                onClick={() => handleToggleEstado(venta)}
                                className="p-2 hover:bg-gray-darker rounded-lg transition-colors group opacity-50 cursor-not-allowed"
                                title="No se puede reactivar una venta anulada"
                              >
                                <Ban className="w-4 h-4 text-gray-lightest" />
                              </button>
                            )}
                            <button
                              onClick={() => handleViewDetails(venta)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Ver detalles"
                            >
                              <Eye className="w-4 h-4 text-gray-lightest group-hover:text-orange-primary" />
                            </button>
                            <button
                              onClick={() => generateVentaPDF(venta)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Generar PDF"
                            >
                              <Download className="w-4 h-4 text-gray-lightest group-hover:text-orange-primary" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-gray-lighter">No se encontraron ventas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación Funcional */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-dark">
                <div className="text-sm text-gray-lightest">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-dark hover:bg-gray-darker disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-lightest" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-dark hover:bg-gray-darker disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-lightest" />
                  </button>
                </div>
              </div>

              {/* Sin resultados */}
              {filteredVentas.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-gray-lightest mb-4">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">No se encontraron ventas</h3>
                    <p className="text-sm">
                      {searchTerm
                        ? `No hay ventas que coincidan con "${searchTerm}"`
                        : "No hay ventas registradas en el sistema"
                      }
                    </p>
                  </div>
                  {searchTerm && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="elegante-button-secondary mt-4"
                    >
                      Limpiar búsqueda
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Diálogo de Detalles de Venta */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto text-white-primary">
            {loadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-primary mx-auto mb-3"></div>
                  <p className="text-gray-lightest text-sm">Cargando detalles...</p>
                </div>
              </div>
            ) : selectedVenta ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-white-primary flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-orange-primary" />
                    Detalle de Venta
                  </DialogTitle>
                  <DialogDescription className="text-gray-lightest">
                    Información registrada de la venta (solo lectura)
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Hash className="w-4 h-4 text-orange-primary" />
                        Número de Venta
                      </Label>
                      <Input
                        value={String(selectedVenta.numeroVenta || selectedVenta.id).replace(/^(FV|VTA)-?/i, '')}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-orange-primary" />
                        Fecha de Registro
                      </Label>
                      <Input
                        value={formatDate(selectedVenta.fecha)}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <User className="w-4 h-4 text-orange-primary" />
                        Cliente
                      </Label>
                      <Input
                        value={`${normalizeCliente(selectedVenta.cliente)}${selectedVenta.clienteDocumento ? ` (${selectedVenta.clienteDocumento})` : ''}`}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-orange-primary" />
                        Método de Pago
                      </Label>
                      <Input
                        value={selectedVenta.metodoPago || 'N/A'}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Scissors className="w-4 h-4 text-orange-primary" />
                        Barbero
                      </Label>
                      <Input
                        value={normalizeBarbero(selectedVenta.barbero)}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-orange-primary" />
                        Porcentaje Descuento (%)
                      </Label>
                      <Input
                        type="number"
                        value={selectedVenta.subtotal > 0 ? ((selectedVenta.descuento / selectedVenta.subtotal) * 100).toFixed(2) : '0'}
                        disabled
                        className="elegante-input no-spin bg-gray-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <User className="w-4 h-4 text-orange-primary" />
                        Responsable
                      </Label>
                      <Input
                        value={selectedVenta.responsable || 'N/A'}
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-orange-primary" />
                          Garantía
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(() => {
                          const diffDays = getRemainingWarrantyDays(selectedVenta.fecha, selectedVenta.garantiaMeses);
                          return (diffDays !== null && diffDays < 0)
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                            : 'bg-green-500/10 text-green-500 border border-green-500/20';
                        })()
                          }`}>
                          {(() => {
                            const diffDays = getRemainingWarrantyDays(selectedVenta.fecha, selectedVenta.garantiaMeses);
                            if (diffDays === null) return '';
                            return diffDays < 0 ? `EXPIRADA (${Math.abs(diffDays)}d)` : `ACTIVA (${diffDays}d)`;
                          })()}
                        </span>
                      </Label>
                      <Input
                        value={
                          (selectedVenta.garantiaMeses ?? 0) <= 0
                            ? '15 días'
                            : selectedVenta.garantiaMeses === 1
                              ? '1 Mes'
                              : selectedVenta.garantiaMeses >= 12
                                ? `${selectedVenta.garantiaMeses / 12} Año(s)`
                                : `${selectedVenta.garantiaMeses} Meses`
                        }
                        disabled
                        className="elegante-input bg-gray-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        Estado
                      </Label>
                      <div className="h-10 flex items-center">
                        <span className={`px-2 py-1 rounded-full text-xs ${getEstadoColor(selectedVenta.estado)}`}>
                          {(selectedVenta.estado || '').toLowerCase().trim() === 'anulada' || (selectedVenta.estado || '').toLowerCase().trim() === 'anulado'
                            ? 'Anulada'
                            : 'Completada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-md font-medium text-white-primary">Productos y Servicios {devolucionesVentaActual.length > 0 ? '(Ajustado por Devoluciones)' : 'Agregados'}:</h4>
                    </div>
                    <div className="space-y-2 max-h-52 overflow-y-auto">
                      {detalleItemsVenta.length > 0 ? (
                        detalleItemsVenta.map((detalle) => (
                          <div key={detalle.key} className={`bg-gray-darker rounded-lg px-3 py-2.5 border-l-2 ${detalle.cantidadDevuelta > 0 ? 'border-yellow-500/40' : 'border-orange-primary/20'}`}>
                            <div className="flex items-center gap-4 flex-nowrap min-w-0">
                              <div className="shrink-0 w-6" aria-hidden />
                              <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden bg-gray-dark border border-gray-dark flex items-center justify-center">
                                <ImageRenderer
                                  url={detalle.imageSrc}
                                  alt={detalle.nombre}
                                  className="w-full h-full border-0 bg-transparent"
                                />
                              </div>
                              <div className="min-w-0 flex-1 shrink flex items-center justify-center">
                                <span className="text-white-primary font-semibold text-base truncate block text-center w-full" title={detalle.nombre}>
                                  {detalle.nombre}
                                  <span className="ml-2 text-[11px] text-gray-lightest font-normal">({detalle.tipo})</span>
                                </span>
                              </div>

                              <div className="flex flex-col gap-0.5 shrink-0">
                                <label className="text-[11px] text-gray-400 font-normal">Cantidad</label>
                                <div className="flex items-center gap-1">
                                  <Input type="number" value={detalle.cantidad} disabled className="w-14 h-7 text-xs text-center tabular-nums elegante-input no-spin py-0 px-1.5 bg-gray-medium" />
                                  {detalle.cantidadDevuelta > 0 && (
                                    <span className="text-[10px] text-yellow-400" title={`Original: ${detalle.cantidadOriginal}, Devueltos: ${detalle.cantidadDevuelta}`}>
                                      (-{detalle.cantidadDevuelta})
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-0.5 shrink-0">
                                <label className="text-[11px] text-gray-400 font-normal">Precio unit.</label>
                                <Input type="number" value={detalle.precio} disabled className="w-20 h-7 text-xs text-right tabular-nums elegante-input no-spin py-0 px-1.5 bg-gray-medium" />
                              </div>

                              <div className="flex flex-col gap-0.5 shrink-0 justify-center">
                                <label className="text-[11px] text-gray-400 font-normal">Subt.</label>
                                <span className="text-orange-primary font-semibold text-xs tabular-nums leading-7">
                                  ${formatCurrency(detalle.subtotal)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="bg-gray-darker p-3 rounded-lg border border-gray-dark text-center">
                          <span className="text-gray-lightest">No hay detalles registrados para esta venta.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  

                  <div className="bg-gray-darker p-4 rounded-xl border border-gray-dark space-y-3">
                    {/* Subtotal Original */}
                    <div className="flex justify-between text-gray-lightest">
                      <span>Subtotal Original:</span>
                      <span className="font-medium">${formatCurrency(selectedVenta.subtotal)}</span>
                    </div>

                    {/* Saldo a Favor Usado - Estilo Verde */}
                    {saldoUsadoDetalle > 0 && (
                      <div className="flex justify-between text-green-500 font-medium">
                        <span>Saldo a Favor Usado:</span>
                        <span className="font-bold">-${formatCurrency(saldoUsadoDetalle)}</span>
                      </div>
                    )}

                    {/* Subtotal Ajustado */}
                    <div className="flex justify-between text-white-primary font-semibold">
                      <span>Subtotal Ajustado:</span>
                      <span>
                        ${formatCurrency(
                          Math.max(0, (selectedVenta.subtotal || 0) - (saldoUsadoDetalle || 0) - (totalMontoDevuelto || 0))
                        )}
                      </span>
                    </div>

                    <hr className="border-gray-medium my-2" />

                    {/* Total Ajustado - Grande y Naranja */}
                    <div className="flex justify-between items-end">
                      <span className="text-white-primary font-bold text-xl">Total Ajustado:</span>
                      <span className="text-orange-primary font-bold text-2xl">
                        ${formatCurrency(
                          devolucionesVentaActual.length > 0
                            ? Math.max(0, subtotalAjustado - (selectedVenta.descuento || 0))
                            : (selectedVenta.total || 0)
                        )}
                      </span>
                    </div>

                    {/* Total Original - Pequeño y Gris como en la imagen */}
                    <div className="flex justify-between text-gray-500 text-[11px] mt-1">
                      <span>Total Original:</span>
                      <span>${formatCurrency((selectedVenta.subtotal || 0) - (selectedVenta.descuento || 0))}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-dark mt-4">
                  <button
                    onClick={() => setIsDetailDialogOpen(false)}
                    className="elegante-button-secondary"
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertContainer />
        <DoubleConfirmationContainer />
      </main>
    </>
  );
}
