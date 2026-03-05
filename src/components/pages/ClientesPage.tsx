import { useState, useEffect, useRef } from "react";
import { clientesService, Cliente, CreateClienteData } from "../../services/clientesService";
import { devolucionService, Devolucion as ApiDevolucion } from "../../services/devolucionService";
import ImageRenderer from "../ui/ImageRenderer";
import {
  Users,
  User as UserIcon,
  Phone,
  Mail,
  Edit,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Calendar,
  UserCheck,
  UserPlus,
  MapPin,
  IdCard,
  Wallet,
  TrendingUp,
  Camera,
  X,
  ToggleLeft,
  ToggleRight,
  UserX,
  Trash2,
  FileText,
  Hash
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { useCustomAlert } from "../ui/custom-alert";
import { useDoubleConfirmation } from "../ui/double-confirmation";
import { useAuth } from "../AuthContext";
import { notifyEntityCreated } from "../../services/notificationService";
import { AppRole } from "../../services/authSyncService";
import { firebaseAuthService } from "../../services/firebase";

// Tipos de documento
const TIPOS_DOCUMENTO = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PP', label: 'Pasaporte' },
  { value: 'RC', label: 'Registro Civil' },
  { value: 'NIT', label: 'NIT' }
];

const CLIENTE_LIMITS = {
  numeroDocumento: 20,
  nombre: 100,
  apellido: 100,
  email: 100,
  telefono: 20,
  direccion: 150,
  barrio: 100
};

// Interface para devoluciones (simulada desde el módulo de devoluciones)

// Interface para devoluciones (simulada desde el módulo de devoluciones)
interface Devolucion {
  id: string;
  cliente: string;
  clienteId: string;
  producto: string;
  tipo: 'Producto' | 'Servicio';
  motivoCategoria: string;
  motivoDetalle: string;
  observaciones?: string;
  fecha: string;
  hora: string;
  monto: number;
  estado: 'Activo' | 'Inactivo';
  responsable: string;
  numeroVenta: string;
  saldoAFavor: number;
}


export function ClientesPage() {
  const { success, error, created, edited, deleted, AlertContainer } = useCustomAlert();
  const { confirmDeleteAction, DoubleConfirmationContainer } = useDoubleConfirmation();
  const { isAdmin, resetPassword } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreateConfirmOpen, setIsCreateConfirmOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [formError, setFormError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Estados para acciones de cliente
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEditConfirmOpen, setIsEditConfirmOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({
    tipoDocumento: 'CC',
    numeroDocumento: '',
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    barrio: '',
    fechaNacimiento: '',
    fotoPerfil: ''
  });
  const [editSelectedProfileImage, setEditSelectedProfileImage] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [createForm, setCreateForm] = useState({
    tipoDocumento: 'CC',
    numeroDocumento: '',
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    direccion: '',
    barrio: '',
    fechaNacimiento: '',
    fotoPerfil: ''
  });

  // Estados para manejo de foto de perfil
  const [selectedProfileImage, setSelectedProfileImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateValidation, setShowCreateValidation] = useState(false);
  const [showEditValidation, setShowEditValidation] = useState(false);
  const [clienteGeneratedPassword, setClienteGeneratedPassword] = useState('');
  const [createInFirebase, setCreateInFirebase] = useState(true);
  const [docDuplicateCreate, setDocDuplicateCreate] = useState(false);
  const [docDuplicateEdit, setDocDuplicateEdit] = useState(false);

  const generateClientePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setClienteGeneratedPassword(password);
  };

  // Cargar clientes desde la API al montar el componente
  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      setLoading(true);
      const [data, devsData] = await Promise.all([
        clientesService.getClientes(),
        devolucionService.getDevoluciones().catch(() => [])
      ]);

      // Guardar devoluciones para otros usos (historial en modal)
      const formattedDevs: Devolucion[] = (devsData || []).map((d: any) => ({
        id: String(d.id),
        cliente: d.clienteNombre || 'Cliente',
        clienteId: String(d.clienteId || ''),
        producto: d.productoNombre || 'Producto',
        tipo: 'Producto',
        motivoCategoria: d.motivo,
        motivoDetalle: d.motivo, // Usar el mismo motivo como detalle por simplicidad
        fecha: d.fecha ? new Date(d.fecha).toLocaleDateString('es-CO') : '',
        hora: d.fecha ? new Date(d.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '',
        monto: Number(d.monto) || 0,
        estado: d.estado === 'Completada' ? 'Activo' : 'Inactivo', // Mapear a los estados locales
        responsable: d.responsableNombre || 'Responsable',
        numeroVenta: String(d.ventaId || ''),
        saldoAFavor: Number(d.saldoAFavor) || 0
      }));
      setDevoluciones(formattedDevs);

      const mappedData = data.map(cliente => {
        const c = clientesService.mapApiToComponent(cliente);
        // Calcular saldo a favor dinámicamente si no viene de la API
        const saldoCalculado = formattedDevs
          .filter(d => d.clienteId === c.id && d.estado === 'Activo')
          .reduce((total, d) => total + d.saldoAFavor, 0);

        return {
          ...c,
          saldoAFavor: c.saldoAFavor || saldoCalculado
        };
      });
      setClientes(mappedData);
    } catch (err: unknown) {
      console.error('Error cargando clientes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      error('Error', `No se pudieron cargar los clientes: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };


  const filteredClientes = clientes.filter(cliente => {
    const searchMatch = cliente.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.numeroDocumento.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.telefono?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.direccion?.toLowerCase().includes(searchTerm.toLowerCase());

    const statusMatch = statusFilter === 'all' ||
      (statusFilter === 'active' && cliente.activo) ||
      (statusFilter === 'inactive' && !cliente.activo);

    return searchMatch && statusMatch;
  });

  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedClientes = filteredClientes.slice(startIndex, startIndex + itemsPerPage);

  // Funciones para manejo de imagen de perfil
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        error('Archivo inválido', 'Por favor selecciona una imagen válida (JPG, PNG, etc.)');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        error('Archivo muy grande', 'La imagen debe pesar menos de 5MB');
        return;
      }

      setSelectedProfileImage(file);

      // Crear URL de vista previa
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeProfileImage = () => {
    setSelectedProfileImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleCreateClick = () => {
    setCreateForm({
      tipoDocumento: 'CC',
      numeroDocumento: '',
      nombre: '',
      apellido: '',
      email: '',
      telefono: '',
      direccion: '',
      barrio: '',
      fechaNacimiento: '',
      fotoPerfil: ''
    });
    setSelectedProfileImage(null);
    setPreviewUrl(null);
    setFormError('');
    setShowCreateValidation(false);
    generateClientePassword();
    setIsCreateDialogOpen(true);
  };

  const validateForm = (form: any) => {
    if (!form.numeroDocumento || !form.nombre || !form.apellido || !form.email || !form.fechaNacimiento) {
      return false;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      error('Email inválido', 'Por favor ingresa un email válido con el formato correcto.');
      return false;
    }

    // Verificar si el documento ya existe
    const documentoExiste = clientes.some(c =>
      c.numeroDocumento === form.numeroDocumento &&
      c.tipoDocumento === form.tipoDocumento
    );

    if (documentoExiste) {
      error('Documento duplicado', 'Ya existe un cliente registrado con este tipo y número de documento.');
      return false;
    }

    // Verificar si el email ya existe
    const emailExiste = clientes.some(c => c.email === form.email);

    if (emailExiste) {
      error('Email duplicado', 'Ya existe un cliente registrado con este email.');
      return false;
    }

    // Validar fecha de nacimiento no sea futura
    if (form.fechaNacimiento) {
      const year = new Date(form.fechaNacimiento).getFullYear();
      const currentYear = new Date().getFullYear();
      if (year > currentYear) {
        error('Fecha de nacimiento inválida', 'No es posible registrar un cliente con una fecha posterior a la fecha actual.');
        return false;
      }
    }

    return true;
  };

  const handleCreateCliente = () => {
    setShowCreateValidation(true);
    if (!validateForm(createForm)) {
      return;
    }
    setIsCreateConfirmOpen(true);
  };

  const confirmCreateCliente = async () => {
    try {
      // Convertir imagen a base64 si existe
      let fotoPerfilBase64 = '';
      if (selectedProfileImage && previewUrl) {
        fotoPerfilBase64 = previewUrl;
      }

      // Preparar datos para la API
      const createData: CreateClienteData = {
        nombre: createForm.nombre,
        apellido: createForm.apellido,
        documento: createForm.numeroDocumento,
        correo: createForm.email,
        telefono: createForm.telefono,
        fechaNacimiento: createForm.fechaNacimiento ? formatDateForAPI(createForm.fechaNacimiento) : '',
        direccion: createForm.direccion,
        barrio: createForm.barrio,
        fotoPerfil: fotoPerfilBase64
      };

      // Crear cliente en la API
      const createdClienteAPI = await clientesService.createCliente({ ...createData, contrasena: clienteGeneratedPassword } as any);
      const mappedCliente = clientesService.mapApiToComponent(createdClienteAPI);

      await notifyEntityCreated('cliente', {
        id: mappedCliente.id,
        nombre: mappedCliente.nombre,
        apellido: mappedCliente.apellido,
        correo: mappedCliente.email,
        telefono: mappedCliente.telefono
      });
      setClientes([mappedCliente, ...clientes]);
      setIsCreateDialogOpen(false);
      setIsCreateConfirmOpen(false);
      setCreateForm({
        tipoDocumento: 'CC',
        numeroDocumento: '',
        nombre: '',
        apellido: '',
        email: '',
        telefono: '',
        direccion: '',
        barrio: '',
        fechaNacimiento: '',
        fotoPerfil: ''
      });
      setSelectedProfileImage(null);
      setPreviewUrl(null);
      setFormError('');

      created('Cliente creado exitosamente ✔️', `El cliente ${mappedCliente.nombre} ${mappedCliente.apellido} ha sido registrado en el sistema.`);

      if (createInFirebase) {
        try {
          const tempPass = (clienteGeneratedPassword && clienteGeneratedPassword.length >= 6)
            ? clienteGeneratedPassword
            : Math.random().toString(36).slice(-8) + "A1";
          await firebaseAuthService.createUserWithoutAffectingSession(
            mappedCliente.email,
            tempPass,
            { sendVerification: false, sendPasswordReset: true }
          );
          created('Cuenta Firebase creada', 'Se envió enlace para configurar contraseña al cliente.');
        } catch (fbErr: any) {
          const msg = String(fbErr?.message || '').toLowerCase();
          if (msg.includes('already')) {
            const res = await resetPassword(mappedCliente.email);
            if (res.success) {
              created('Correo ya existe en Firebase', 'Se envió enlace para configurar contraseña.');
            } else {
              error('No se pudo enviar enlace de contraseña', 'Intenta nuevamente.');
            }
          } else {
            error('No se pudo crear cuenta en Firebase', 'Verifica el correo del cliente e intenta nuevamente.');
          }
        }
      }
    } catch (err: unknown) {
      console.error('Error creando cliente:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      error('Error', `No se pudo crear el cliente: ${errorMessage}`);
    }
  };

  // Función para formatear moneda colombiana
  const formatCurrency = (amount: number | undefined | null): string => {
    return (amount ?? 0).toLocaleString('es-CO');
  };

  // Función para calcular el saldo a favor acumulativo de un cliente
  const calcularSaldoAFavorCliente = (clienteId: string, devoluciones: Devolucion[]): number => {
    return devoluciones
      .filter(d => d.clienteId === clienteId && d.estado === 'Activo')
      .reduce((total, d) => total + d.saldoAFavor, 0);
  };

  // Función para obtener el estado texto
  const getEstadoTexto = (ultimaVisita?: string) => {
    if (!ultimaVisita) return "Nuevo";

    const fechaVisita = new Date(ultimaVisita.split('-').reverse().join('-'));
    const ahora = new Date();
    const diasSinVisitar = Math.floor((ahora.getTime() - fechaVisita.getTime()) / (1000 * 60 * 60 * 24));

    if (diasSinVisitar <= 30) return "Activo";
    if (diasSinVisitar <= 60) return "Regular";
    return "Inactivo";
  };

  // Función para obtener las devoluciones de un cliente
  const getDevolucionesCliente = (clienteId: string) => {
    return devoluciones
      .filter(d => d.clienteId === clienteId)
      .sort((a, b) => new Date(b.fecha.split('-').reverse().join('-')).getTime() - new Date(a.fecha.split('-').reverse().join('-')).getTime());
  };

  // Funciones de paginación
  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Resetear página cuando se filtra
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Funciones para acciones de cliente
  const handleViewCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setIsViewDialogOpen(true);
  };

  const handleEditCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setEditForm({
      tipoDocumento: cliente.tipoDocumento,
      numeroDocumento: cliente.numeroDocumento,
      nombre: cliente.nombre,
      apellido: cliente.apellido,
      email: cliente.email,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      barrio: cliente.barrio,
      fechaNacimiento: cliente.fechaNacimiento
        ? cliente.fechaNacimiento.split("T")[0]
        : "",
      fotoPerfil: cliente.fotoPerfil || ''
    });

    // Si tiene foto de perfil, mostrarla en la edición
    if (cliente.fotoPerfil) {
      setEditPreviewUrl(cliente.fotoPerfil);
    } else {
      setEditPreviewUrl(null);
    }
    setEditSelectedProfileImage(null);
    setShowEditValidation(false);

    setIsEditDialogOpen(true);
  };

  const handleEditImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        error('Archivo inválido', 'Por favor selecciona una imagen válida (JPG, PNG, etc.)');
        return;
      }

      // Validar tamaño de archivo (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        error('Archivo muy grande', 'La imagen debe pesar menos de 5MB');
        return;
      }

      setEditSelectedProfileImage(file);

      // Crear URL de vista previa
      const reader = new FileReader();
      reader.onload = (e) => {
        setEditPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeEditProfileImage = () => {
    setEditSelectedProfileImage(null);
    setEditPreviewUrl(null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
    setEditForm({ ...editForm, fotoPerfil: '' });
  };

  const triggerEditFileSelect = () => {
    editFileInputRef.current?.click();
  };

  const validateEditForm = (form: any) => {
    if (!form.numeroDocumento || !form.nombre || !form.apellido || !form.email || !form.fechaNacimiento) {
      return false;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      error('Email inválido', 'Por favor ingresa un email válido con el formato correcto.');
      return false;
    }

    // Verificar si el documento ya existe (excepto el cliente actual)
    const documentoExiste = clientes.some(c =>
      c.id !== selectedCliente?.id &&
      c.numeroDocumento === form.numeroDocumento &&
      c.tipoDocumento === form.tipoDocumento
    );

    if (documentoExiste) {
      error('Documento duplicado', 'Ya existe otro cliente registrado con este tipo y número de documento.');
      return false;
    }

    // Verificar si el email ya existe (excepto el cliente actual)
    const emailExiste = clientes.some(c => c.id !== selectedCliente?.id && c.email === form.email);

    if (emailExiste) {
      error('Email duplicado', 'Ya existe otro cliente registrado con este email.');
      return false;
    }

    // Validar fecha de nacimiento no sea futura
    if (form.fechaNacimiento) {
      const year = new Date(form.fechaNacimiento).getFullYear();
      const currentYear = new Date().getFullYear();
      if (year > currentYear) {
        error('Fecha de nacimiento inválida', 'No es posible registrar un cliente con una fecha posterior a la fecha actual.');
        return false;
      }
    }

    return true;
  };

  const handleSaveEditCliente = () => {
    setShowEditValidation(true);
    if (!validateEditForm(editForm)) {
      return;
    }
    setIsEditConfirmOpen(true);
  };

  // Función para formatear fecha para la API
  const formatDateForAPI = (dateString: string): string => {
    if (!dateString) return '';

    const date = new Date(dateString);
    const year = date.getFullYear();

    // Validar que el año sea razonable (entre 1900 y año actual + 100)
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear + 100) {
      console.warn('Año inválido:', year);
      return '';
    }

    return date.toISOString().split('T')[0];
  };

  const confirmEditCliente = async () => {
    if (!selectedCliente) return;

    try {
      // Usar la imagen nueva si se seleccionó, o mantener la existente
      let fotoPerfilFinal = selectedCliente.fotoPerfil || '';
      if (editSelectedProfileImage && editPreviewUrl) {
        fotoPerfilFinal = editPreviewUrl;
      } else if (editPreviewUrl) {
        fotoPerfilFinal = editPreviewUrl;
      }

      // Preparar datos para la API
      const updateData: any = {
        id: parseInt(selectedCliente.id),
        nombre: editForm.nombre,
        apellido: editForm.apellido,
        documento: editForm.numeroDocumento,
        correo: editForm.email,
        telefono: editForm.telefono,
        fechaNacimiento: editForm.fechaNacimiento ? formatDateForAPI(editForm.fechaNacimiento) : '',
        direccion: editForm.direccion,
        barrio: editForm.barrio,
        fotoPerfil: fotoPerfilFinal,
        estado: selectedCliente.activo // Pasar el estado actual del cliente
      };

      // Actualizar cliente en la API
      const updatedClienteAPI = await clientesService.updateCliente(parseInt(selectedCliente.id), updateData);
      const mappedCliente = clientesService.mapApiToComponent(updatedClienteAPI);

      setClientes(clientes.map(c =>
        c.id === selectedCliente.id ? mappedCliente : c
      ));

      setIsEditDialogOpen(false);
      setIsEditConfirmOpen(false);
      setSelectedCliente(null);
      setEditForm({});
      setEditSelectedProfileImage(null);
      setEditPreviewUrl(null);

      edited('Cliente actualizado exitosamente ✔️', `Los datos de ${mappedCliente.nombre} ${mappedCliente.apellido} han sido actualizados.`);
    } catch (err: unknown) {
      console.error('Error actualizando cliente:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      error('Error', `No se pudo actualizar el cliente: ${errorMessage}`);
    }
  };

  // Función para eliminar cliente
  const handleDeleteCliente = (cliente: Cliente) => {
    // Validar permisos: solo administrador o superior
    if (!isAdmin()) {
      error('Acceso denegado', 'Solo los administradores pueden eliminar clientes del sistema.');
      return;
    }

    confirmDeleteAction(
      "confirmar",
      async () => {
        try {
          const idNum = parseInt(cliente.id);
          await clientesService.deleteCliente(idNum, {
            correo: cliente.email,
            documento: cliente.numeroDocumento,
            tipoDocumento: cliente.tipoDocumento
          });
          let stillExists = false;
          try {
            const check = await clientesService.getClienteById(idNum);
            if (check && (check.id || (check as any).Id)) {
              stillExists = true;
            }
          } catch {
            stillExists = false;
          }
          if (stillExists) {
            try {
              await clientesService.toggleClienteEstado(idNum, false);
              setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, activo: false } : c));
              success('Cliente desactivado', 'Este cliente tiene registros asociados. Se desactivó para conservar el historial.');
            } catch {
              error('No se puede eliminar', 'Este cliente tiene registros asociados (ventas, compras, agendamientos o entregas de insumos). Solo se puede desactivar para conservar el historial.');
            }
            // Evitar que el flujo muestre éxito de eliminación
            throw new Error('DEACTIVATED_INSTEAD');
          }
          setClientes(prev => prev.filter(c => c.id !== cliente.id));
          setSelectedItems(prev => prev.filter(id => id !== cliente.id));
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? (err.message || '') : String(err || '');
          const msg = errorMessage.toLowerCase();
          const related =
            msg.includes('409') ||
            msg.includes('foreign') ||
            msg.includes('constraint') ||
            msg.includes('referenc') ||
            msg.includes('venta') ||
            msg.includes('compra') ||
            msg.includes('agend') ||
            msg.includes('cita') ||
            msg.includes('insumo') ||
            msg.includes('entrega');
          if (related) {
            try {
              await clientesService.toggleClienteEstado(parseInt(cliente.id), false);
              setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, activo: false } : c));
              success('Cliente desactivado', 'Este cliente tiene registros asociados. Se desactivó para conservar el historial.');
            } catch {
              error('No se puede eliminar', 'Este cliente tiene registros asociados (ventas, compras, agendamientos o entregas de insumos). Solo se puede desactivar para conservar el historial.');
            }
          } else {
            error('Error', `No se pudo eliminar el cliente: ${errorMessage || 'Error desconocido'}`);
          }
          // Lanzar para evitar que se dispare la alerta de éxito de confirmación
          throw new Error(errorMessage || 'DELETE_FAILED');
        }
      },
      {
        confirmTitle: "Confirmar Eliminación de Cliente",
        confirmMessage: `¿Estás seguro de que deseas eliminar permanentemente al cliente "${cliente.nombre} ${cliente.apellido}" con documento "${cliente.tipoDocumento} ${cliente.numeroDocumento}"?`,
        successTitle: "¡Cliente eliminado exitosamente!",
        successMessage: `El cliente ha sido eliminado permanentemente del sistema.`,
        requireInput: true
      }
    );
  };

  // Función para cambiar el estado del cliente (activo/inactivo)
  const toggleClienteStatus = async (clienteId: string) => {
    try {
      const cliente = clientes.find(c => c.id === clienteId);
      if (!cliente) {
        console.error('Cliente no encontrado con ID:', clienteId);
        return;
      }

      const nuevoEstado = !cliente.activo;

      // Cambiar estado en la API
      await clientesService.toggleClienteEstado(parseInt(clienteId), nuevoEstado);

      // Actualizar localmente
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, activo: nuevoEstado } : c));

      const updatedCliente = clientes.find(c => c.id === clienteId);

      success(
        `Cliente ${nuevoEstado ? 'activado' : 'desactivado'}`,
        `El cliente ${updatedCliente?.nombre} ${updatedCliente?.apellido} ha sido ${nuevoEstado ? 'activado' : 'desactivado'} exitosamente.`
      );
    } catch (err: unknown) {
      console.error('Error cambiando estado del cliente:', err);
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      error('Error', `No se pudo cambiar el estado del cliente: ${errorMessage}`);
    }
  };

  // Estadísticas de saldos
  const totalClientesConSaldo = clientes.filter(c => ((c.saldoAFavor || 0) || 0) > 0).length;
  const totalSaldosAFavor = clientes.reduce((total, c) => total + ((c.saldoAFavor || 0) || 0), 0);

  return (
    <>
      {/* Header */}
      <header className="bg-black-primary border-b border-gray-dark px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white-primary">Gestión de Clientes</h1>
            <p className="text-sm text-gray-lightest mt-1">Administra los clientes registrados con fotos de perfil</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 bg-black-primary">
        {/* Stats Cards */}
        <div style={{ display: 'none' }} className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="elegante-card text-center">
            <Users className="w-8 h-8 text-orange-primary mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">{clientes.length}</h4>
            <p className="text-gray-lightest text-sm">Total Clientes</p>
          </div>
          <div className="elegante-card text-center">
            <UserCheck className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">
              {clientes.filter(c => c.activo).length}
            </h4>
            <p className="text-gray-lightest text-sm">Clientes Activos</p>
          </div>
          <div className="elegante-card text-center">
            <UserX className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">
              {clientes.filter(c => !c.activo).length}
            </h4>
            <p className="text-gray-lightest text-sm">Clientes Inactivos</p>
          </div>
          <div className="elegante-card text-center">
            <Wallet className="w-8 h-8 text-orange-secondary mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">{totalClientesConSaldo}</h4>
            <p className="text-gray-lightest text-sm">Con Saldo a Favor</p>
          </div>
          <div className="elegante-card text-center">
            <TrendingUp className="w-8 h-8 text-orange-primary mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">${formatCurrency(totalSaldosAFavor)}</h4>
            <p className="text-gray-lightest text-sm">Total Saldos</p>
          </div>
        </div>

        {/* Sección Principal */}
        <div className="elegante-card">
          {/* Barra de Controles */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-dark">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleCreateClick}
                className="elegante-button-primary gap-2 flex items-center"
              >
                <UserPlus className="w-4 h-4" />
                Añadir Cliente
              </button>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-lighter pointer-events-none z-10" />
                <Input
                  placeholder="Buscar por documento, nombre, email o teléfono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="elegante-input pl-11 w-80"
                />
              </div>

              {/* Filtros de Estado */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'all'
                    ? 'bg-orange-primary text-black-primary'
                    : 'bg-gray-darker text-gray-lightest hover:bg-gray-dark border border-gray-dark'
                    }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-darker text-gray-lightest hover:bg-gray-dark border border-gray-dark'
                    }`}
                >
                  Activos
                </button>
                <button
                  onClick={() => setStatusFilter('inactive')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'inactive'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-darker text-gray-lightest hover:bg-gray-dark border border-gray-dark'
                    }`}
                >
                  Inactivos
                </button>
              </div>
            </div>

            {/* Información de filtros activos */}
            <div className="flex items-center space-x-4">
              {(searchTerm || statusFilter !== 'all') && (
                <div className="flex items-center space-x-2">
                  {searchTerm && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-orange-primary/20 border border-orange-primary rounded-full">
                      <Search className="w-3 h-3 text-orange-primary" />
                      <span className="text-xs text-orange-primary font-medium">
                        "{searchTerm}"
                      </span>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="text-orange-primary hover:text-orange-secondary"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {statusFilter !== 'all' && (
                    <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${statusFilter === 'active'
                      ? 'bg-green-600/20 border-green-600 text-green-400'
                      : 'bg-red-600/20 border-red-600 text-red-400'
                      }`}>
                      {statusFilter === 'active' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      <span className="text-xs font-medium">
                        {statusFilter === 'active' ? 'Activos' : 'Inactivos'}
                      </span>
                      <button
                        onClick={() => setStatusFilter('all')}
                        className="hover:opacity-70"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <span className="text-sm text-gray-lightest">
                {filteredClientes.length} cliente{filteredClientes.length !== 1 ? 's' : ''}
                {(searchTerm || statusFilter !== 'all') && ` (de ${clientes.length} total)`}
              </span>
            </div>
          </div>

          {/* Tabla de Clientes */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin mr-3"></div>
                <span className="text-white-primary">Cargando clientes...</span>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-dark">
                    <th className="text-left py-3 px-4 text-gray-lightest font-medium text-sm">Documento</th>
                    <th className="text-left py-3 px-4 text-gray-lightest font-medium text-sm">Cliente</th>
                    <th className="text-center py-3 px-4 text-gray-lightest font-medium text-sm">Teléfono</th>
                    <th className="text-center py-3 px-4 text-gray-lightest font-medium text-sm">Saldo a Favor</th>
                    <th className="text-right py-3 px-4 text-gray-lightest font-medium text-sm">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedClientes.map((cliente) => (
                    <tr key={cliente.id} className="border-b border-gray-dark hover:bg-gray-darker transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <IdCard className="w-4 h-4 text-orange-primary" />
                          <span className="text-gray-lighter">{cliente.numeroDocumento}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <ImageRenderer
                            url={cliente.fotoPerfil}
                            alt={`Foto de ${cliente.nombre}`}
                            className="w-10 h-10 rounded-full border-2 border-orange-primary"
                          />
                          <span className="text-gray-lighter">{cliente.nombre} {cliente.apellido}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-gray-lighter">{cliente.telefono}</span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {(cliente.saldoAFavor || 0) > 0 ? (
                          <span className="text-gray-lighter">${formatCurrency((cliente.saldoAFavor || 0))}</span>
                        ) : (
                          <span className="text-gray-medium">$0</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleClienteStatus(cliente.id)}
                            className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                            title={cliente.activo ? "Desactivar cliente" : "Activar cliente"}
                          >
                            {cliente.activo ? (
                              <ToggleRight className="w-4 h-4 text-gray-lightest group-hover:text-green-400" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-gray-lightest group-hover:text-red-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleViewCliente(cliente)}
                            className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                            title="Ver detalles"
                          >
                            <Eye className="w-4 h-4 text-gray-lightest group-hover:text-orange-primary" />
                          </button>
                          <button
                            onClick={() => handleEditCliente(cliente)}
                            className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                            title="Editar cliente"
                          >
                            <Edit className="w-4 h-4 text-gray-lightest group-hover:text-blue-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteCliente(cliente)}
                            className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-4 h-4 text-gray-lightest group-hover:text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
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

          {/* Mensaje cuando no hay resultados */}
          {filteredClientes.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-medium mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white-primary mb-2">No se encontraron clientes</h3>
              <p className="text-gray-lightest mb-4">
                {searchTerm ?
                  `No hay clientes que coincidan con "${searchTerm}"` :
                  'No hay clientes registrados en el sistema'
                }
              </p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="elegante-button-secondary"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Diálogo para Ver Detalles del Cliente */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="bg-gray-darkest border-gray-dark max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white-primary">Detalle del Cliente</DialogTitle>
            <DialogDescription className="text-gray-lightest">
              {selectedCliente?.numeroDocumento} - {selectedCliente?.nombre} {selectedCliente?.apellido}
            </DialogDescription>
          </DialogHeader>
          {selectedCliente && (
            <div className="space-y-6 pt-4 overflow-y-auto pr-2 max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-light">ID de Cliente</p>
                  <p className="font-semibold text-orange-primary">{selectedCliente.numeroDocumento}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-light">Fecha de Registro</p>
                  <p className="font-semibold text-white-primary">{selectedCliente.fechaRegistro}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-light">Nombre Completo</p>
                  <p className="font-semibold text-white-primary">{selectedCliente.nombre} {selectedCliente.apellido}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-light">Tipo de Documento</p>
                  <p className="font-semibold text-white-primary">{selectedCliente.tipoDocumento}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-light">Estado</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${selectedCliente.activo ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    }`}>
                    {selectedCliente.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-light">Última Visita</p>
                  <p className="font-semibold text-white-primary">
                    {selectedCliente.ultimaVisita || 'Nunca'}
                  </p>
                </div>
              </div>

              {/* Información de Contacto */}
              <div>
                <h4 className="font-semibold text-white-primary mb-3">Información de Contacto</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-gray-darker p-3 rounded-lg">
                    <div className="flex-1">
                      <span className="text-white-primary font-medium">Email</span>
                      <div className="text-sm text-gray-lightest">
                        {selectedCliente.email}
                      </div>
                    </div>
                  </div>
                  {selectedCliente.telefono && (
                    <div className="flex items-center justify-between bg-gray-darker p-3 rounded-lg">
                      <div className="flex-1">
                        <span className="text-white-primary font-medium">Teléfono</span>
                        <div className="text-sm text-gray-lightest">
                          {selectedCliente.telefono}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedCliente.direccion && (
                    <div className="flex items-center justify-between bg-gray-darker p-3 rounded-lg">
                      <div className="flex-1">
                        <span className="text-white-primary font-medium">Dirección</span>
                        <div className="text-sm text-gray-lightest">
                          {selectedCliente.direccion}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedCliente.barrio && (
                    <div className="flex items-center justify-between bg-gray-darker p-3 rounded-lg">
                      <div className="flex-1">
                        <span className="text-white-primary font-medium">Barrio</span>
                        <div className="text-sm text-gray-lightest">
                          {selectedCliente.barrio}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Información Personal */}
              <div>
                <h4 className="font-semibold text-white-primary mb-3">Información Personal</h4>
                <div className="space-y-2">
                  {selectedCliente.fechaNacimiento && (
                    <div className="flex items-center justify-between bg-gray-darker p-3 rounded-lg">
                      <div className="flex-1">
                        <span className="text-white-primary font-medium">Fecha de Nacimiento</span>
                        <div className="text-sm text-gray-lightest">
                          {selectedCliente.fechaNacimiento}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Resumen del Cliente */}
              <div className="bg-gray-darker p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-gray-lightest">
                  <span>Saldo a Favor:</span>
                  <span>${formatCurrency(selectedCliente.saldoAFavor)}</span>
                </div>
                <div className="flex justify-between text-gray-lightest">
                  <span>Devoluciones Activas:</span>
                  <span>{getDevolucionesCliente(selectedCliente.id).filter(d => d.estado === 'Activo').length}</span>
                </div>
                <div className="flex justify-between text-gray-lightest">
                  <span>Estado de Visitas:</span>
                  <span>{getEstadoTexto(selectedCliente.ultimaVisita)}</span>
                </div>
                <hr className="border-gray-medium" />
                <div className="flex justify-between text-white-primary font-bold text-lg">
                  <span>Estado del Cliente:</span>
                  <span className={`${selectedCliente.activo ? "text-green-400" : "text-red-400"}`}>
                    {selectedCliente.activo ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-gray-dark">
                <button
                  onClick={() => setIsViewDialogOpen(false)}
                  className="elegante-button-primary"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo para Editar Cliente */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white-primary">Editar Cliente</DialogTitle>
            <DialogDescription className="text-gray-lightest">
              Modifica la información del cliente. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            {/* Foto de Perfil y Tipo de Documento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Camera className="w-4 h-4 text-orange-primary" />
                  Foto de Perfil
                </Label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {editPreviewUrl ? (
                      <div className="relative w-16 h-16 rounded-full object-cover border-2 border-orange-primary overflow-hidden">
                        <ImageRenderer
                          url={editPreviewUrl}
                          alt="Vista previa"
                          className="w-full h-full rounded-2xl"
                        />
                        <button
                          onClick={removeEditProfileImage}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                          type="button"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-dark border-2 border-gray-medium flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-gray-lightest" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={triggerEditFileSelect}
                    className="elegante-button-secondary text-xs px-3 py-1.5 gap-1.5 flex items-center"
                    type="button"
                  >
                    <Camera className="w-3 h-3" />
                    {editPreviewUrl ? 'Cambiar' : 'Subir'}
                  </button>
                </div>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditImageUpload}
                  className="hidden"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-primary" />
                  Tipo de Documento *
                </Label>
                <select
                  value={editForm.tipoDocumento}
                  onChange={(e) => setEditForm({ ...editForm, tipoDocumento: e.target.value })}
                  className="elegante-input w-full"
                >
                  {TIPOS_DOCUMENTO.map(tipo => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Información Personal y Documento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Hash className="w-4 h-4 text-orange-primary" />
                  Número de Documento *
                </Label>
                <Input
                  type="number"
                  value={editForm.numeroDocumento}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, '');
                    const next = { ...editForm, numeroDocumento: onlyDigits };
                    setEditForm(next);
                    setDocDuplicateEdit(clientes.some(c =>
                      c.id !== selectedCliente?.id &&
                      c.numeroDocumento === onlyDigits &&
                      c.tipoDocumento === next.tipoDocumento
                    ));
                  }}
                  maxLength={CLIENTE_LIMITS.numeroDocumento}
                  className={`elegante-input w-full ${showEditValidation && !editForm.numeroDocumento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Número de documento"
                />
                {showEditValidation && !editForm.numeroDocumento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                {docDuplicateEdit && <p className="text-xs text-red-500 mt-1">No se puede crear un usuario con un documento existente.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-orange-primary" />
                  Nombres *
                </Label>
                <Input
                  value={editForm.nombre}
                  onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                  maxLength={CLIENTE_LIMITS.nombre}
                  className={`elegante-input w-full ${showEditValidation && !editForm.nombre ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Ingresa los nombres"
                />
                {showEditValidation && !editForm.nombre && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-orange-primary" />
                  Apellidos *
                </Label>
                <Input
                  value={editForm.apellido}
                  onChange={(e) => setEditForm({ ...editForm, apellido: e.target.value })}
                  maxLength={CLIENTE_LIMITS.apellido}
                  className={`elegante-input w-full ${showEditValidation && !editForm.apellido ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Ingresa los apellidos"
                />
                {showEditValidation && !editForm.apellido && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-primary" />
                  Fecha de Nacimiento
                </Label>
                <Input
                  type="date"
                  value={editForm.fechaNacimiento}
                  onChange={(e) => setEditForm({ ...editForm, fechaNacimiento: e.target.value })}
                  className={`elegante-input w-full ${showEditValidation && !editForm.fechaNacimiento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                />
                {showEditValidation && !editForm.fechaNacimiento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
            </div>

            {/* Información de Contacto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Mail className="w-4 h-4 text-orange-primary" />
                  Correo Electrónico *
                </Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  maxLength={CLIENTE_LIMITS.email}
                  className={`elegante-input w-full ${showEditValidation && !editForm.email ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="correo@ejemplo.com"
                />
                {showEditValidation && !editForm.email && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Phone className="w-4 h-4 text-orange-primary" />
                  Número de Celular
                </Label>
                <Input
                  value={editForm.telefono}
                  onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                  maxLength={CLIENTE_LIMITS.telefono}
                  className="elegante-input w-full"
                  placeholder="+57 300 123 4567"
                />
              </div>
            </div>

            {/* Dirección */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-primary" />
                  Dirección
                </Label>
                <Input
                  value={editForm.direccion}
                  onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                  maxLength={CLIENTE_LIMITS.direccion}
                  className="elegante-input w-full"
                  placeholder="Dirección completa"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-primary" />
                  Barrio
                </Label>
                <Input
                  value={editForm.barrio}
                  onChange={(e) => setEditForm({ ...editForm, barrio: e.target.value })}
                  maxLength={CLIENTE_LIMITS.barrio}
                  className="elegante-input w-full"
                  placeholder="Nombre del barrio"
                />
              </div>
            </div>


            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-dark">
              <button
                onClick={() => {
                  setShowEditValidation(false);
                  setIsEditDialogOpen(false);
                }}
                className="elegante-button-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEditCliente}
                className="elegante-button-primary"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo para Crear Cliente */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white-primary">Añadir Nuevo Cliente</DialogTitle>
            <DialogDescription className="text-gray-lightest">
              Completa la información del nuevo cliente. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            {/* Foto de Perfil y Tipo de Documento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Camera className="w-4 h-4 text-orange-primary" />
                  Foto de Perfil
                </Label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {previewUrl ? (
                      <div className="relative w-16 h-16 rounded-full object-cover border-2 border-orange-primary overflow-hidden">
                        <ImageRenderer
                          url={previewUrl}
                          alt="Vista previa"
                          className="w-full h-full rounded-2xl"
                        />
                        <button
                          onClick={removeProfileImage}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                          type="button"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-dark border-2 border-gray-medium flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-gray-lightest" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={triggerFileSelect}
                    className="elegante-button-secondary text-xs px-3 py-1.5 gap-1.5 flex items-center"
                    type="button"
                  >
                    <Camera className="w-3 h-3" />
                    {previewUrl ? 'Cambiar' : 'Subir'}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-primary" />
                  Tipo de Documento *
                </Label>
                <select
                  value={createForm.tipoDocumento}
                  onChange={(e) => setCreateForm({ ...createForm, tipoDocumento: e.target.value })}
                  className="elegante-input w-full"
                >
                  {TIPOS_DOCUMENTO.map(tipo => (
                    <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Información Personal y Documento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Hash className="w-4 h-4 text-orange-primary" />
                  Número de Documento *
                </Label>
                <Input
                  type="number"
                  value={createForm.numeroDocumento}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, '');
                    const next = { ...createForm, numeroDocumento: onlyDigits };
                    setCreateForm(next);
                    setDocDuplicateCreate(clientes.some(c =>
                      c.numeroDocumento === onlyDigits &&
                      c.tipoDocumento === next.tipoDocumento
                    ));
                  }}
                  maxLength={CLIENTE_LIMITS.numeroDocumento}
                  className={`elegante-input w-full ${showCreateValidation && !createForm.numeroDocumento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Número de documento"
                />
                {showCreateValidation && !createForm.numeroDocumento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                {docDuplicateCreate && <p className="text-xs text-red-500 mt-1">No se puede crear un usuario con un documento existente.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-orange-primary" />
                  Nombres *
                </Label>
                <Input
                  value={createForm.nombre}
                  onChange={(e) => setCreateForm({ ...createForm, nombre: e.target.value })}
                  maxLength={CLIENTE_LIMITS.nombre}
                  className={`elegante-input w-full ${showCreateValidation && !createForm.nombre ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Ingresa los nombres"
                />
                {showCreateValidation && !createForm.nombre && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-orange-primary" />
                  Apellidos *
                </Label>
                <Input
                  value={createForm.apellido}
                  onChange={(e) => setCreateForm({ ...createForm, apellido: e.target.value })}
                  maxLength={CLIENTE_LIMITS.apellido}
                  className={`elegante-input w-full ${showCreateValidation && !createForm.apellido ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="Ingresa los apellidos"
                />
                {showCreateValidation && !createForm.apellido && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-primary" />
                  Fecha de Nacimiento
                </Label>
                <Input
                  type="date"
                  value={createForm.fechaNacimiento}
                  onChange={(e) => setCreateForm({ ...createForm, fechaNacimiento: e.target.value })}
                  className={`elegante-input w-full ${showCreateValidation && !createForm.fechaNacimiento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                />
                {showCreateValidation && !createForm.fechaNacimiento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
            </div>

            {/* Información de Contacto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Mail className="w-4 h-4 text-orange-primary" />
                  Correo Electrónico *
                </Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  maxLength={CLIENTE_LIMITS.email}
                  className={`elegante-input w-full ${showCreateValidation && !createForm.email ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                  placeholder="correo@ejemplo.com"
                />
                {showCreateValidation && !createForm.email && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <Phone className="w-4 h-4 text-orange-primary" />
                  Número de Celular
                </Label>
                <Input
                  value={createForm.telefono}
                  onChange={(e) => setCreateForm({ ...createForm, telefono: e.target.value })}
                  maxLength={CLIENTE_LIMITS.telefono}
                  className="elegante-input w-full"
                  placeholder="+57 300 123 4567"
                />
              </div>
            </div>

            {/* Dirección */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-primary" />
                  Dirección
                </Label>
                <Input
                  value={createForm.direccion}
                  onChange={(e) => setCreateForm({ ...createForm, direccion: e.target.value })}
                  maxLength={CLIENTE_LIMITS.direccion}
                  className="elegante-input w-full"
                  placeholder="Dirección completa"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-orange-primary" />
                  Barrio
                </Label>
                <Input
                  value={createForm.barrio}
                  onChange={(e) => setCreateForm({ ...createForm, barrio: e.target.value })}
                  maxLength={CLIENTE_LIMITS.barrio}
                  className="elegante-input w-full"
                  placeholder="Nombre del barrio"
                />
              </div>
            </div>


            {/* Contraseña temporal generada automáticamente al crear (no visible en el formulario) */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={createInFirebase}
                onChange={(e) => setCreateInFirebase(e.target.checked)}
              />
              <Label className="text-white-primary">Crear en Firebase y enviar enlace de contraseña</Label>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-dark">
              <button
                onClick={() => {
                  setShowCreateValidation(false);
                  setIsCreateDialogOpen(false);
                }}
                className="elegante-button-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCliente}
                className="elegante-button-primary"
                disabled={docDuplicateCreate}
              >
                Crear Cliente
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación crear */}
      <AlertDialog open={isCreateConfirmOpen} onOpenChange={setIsCreateConfirmOpen}>
        <AlertDialogContent className="bg-gray-darkest border border-gray-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white-primary">Confirmar Creación</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-lightest">
              ¿Estás seguro de que deseas crear este nuevo cliente? La información será guardada en el sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setIsCreateConfirmOpen(false)}
              className="elegante-button-secondary"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCreateCliente}
              className="elegante-button-primary"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmación editar */}
      <AlertDialog open={isEditConfirmOpen} onOpenChange={setIsEditConfirmOpen}>
        <AlertDialogContent className="bg-gray-darkest border border-gray-dark">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white-primary">Confirmar Cambios</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-lightest">
              ¿Estás seguro de que deseas guardar los cambios realizados en este cliente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setIsEditConfirmOpen(false)}
              className="elegante-button-secondary"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmEditCliente}
              className="elegante-button-primary"
            >
              Guardar Cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contenedor de alertas */}
      <AlertContainer />

      {/* Contenedor de confirmaciones de eliminación */}
      <DoubleConfirmationContainer />
    </>
  );
}
