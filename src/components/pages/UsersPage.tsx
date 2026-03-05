import React, { useRef, useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import {
  Users, Plus, Edit, Trash2, Mail, Phone, Calendar,
  Search, UserCheck, UserX, Eye, User as UserIcon, ChevronLeft,
  ChevronRight, MapPin, CreditCard, Home, Camera,
  ToggleRight, ToggleLeft, X, Loader2, IdCard, KeyRound,
  Users2
} from "lucide-react";
import { toast } from "sonner";
import { useCustomAlert } from "../ui/custom-alert";
import { apiService, ApiUser } from "../../services/api";
import ImageRenderer from "../ui/ImageRenderer";
import { clientesService } from "../../services/clientesService";
import { barberosService } from "../../services/barberosService";
import { rolesApiService, RoleWithModules } from "../../services/rolesApiService";
import { notifyEntityCreated } from "../../services/notificationService";

import { useAuth } from "../AuthContext";
import { firebaseAuthService } from "../../services/firebase";
// ... imports ...

// DTOs para la comunicación con la API
// Estos objetos definen la estructura de datos que se envía y recibe del backend
interface UsuarioInput {
  nombre: string;           // Nombre del usuario
  apellido: string;          // Apellido del usuario
  correo: string;            // Correo electrónico (único)
  contrasena?: string;       // Contraseña (opcional para actualizaciones)
  rolId: number;            // ID del rol (1:Admin, 2:Barbero, 3:Cliente, 4:Recepcionista, 5:Gerente, 6:Cajero)
  tipoDocumento?: string;   // Tipo de documento (Cédula, Pasaporte, etc.)
  documento?: string;       // Número de documento
  telefono?: string;         // Teléfono del usuario
  direccion?: string;       // Dirección completa
  barrio?: string;           // Barrio o localidad
  fechaNacimiento?: string; // Fecha de nacimiento (YYYY-MM-DD)
  fotoPerfil?: string;       // URL de la imagen de perfil (subida via /api/upload)
  estado: boolean;          // Estado del usuario (true: activo, false: inactivo)
}

// Response del endpoint de upload de imágenes
interface UploadResponse {
  url: string;     // URL relativa del archivo guardado
  message: string; // Mensaje de confirmación
}


const tiposDocumento = ["Cédula", "Cédula de Extranjería", "Pasaporte"];

export function UsersPage() {
  const { user: currentUser, resetPassword } = useAuth();
  const { success: showSuccess, error: showError, AlertContainer } = useCustomAlert();
  const [users, setUsers] = useState<any[]>([]); // Estado principal - única fuente de verdad
  const [availableRoles, setAvailableRoles] = useState<RoleWithModules[]>([]);
  const [loading, setLoading] = useState(true);

  // Mapear datos de la API al formato del componente (dentro del componente para usar availableRoles si es necesario)
  const mapApiUserToComponent = (apiUser: ApiUser): any => {
    return {
      id: apiUser.id,
      nombres: apiUser.nombre,
      apellidos: apiUser.apellido,
      tipoDocumento: apiUser.tipoDocumento || "Cédula",
      documento: apiUser.documento || "",
      correo: apiUser.correo,
      celular: apiUser.telefono || "",
      direccion: apiUser.direccion || "",
      barrio: apiUser.barrio || "",
      fechaNacimiento: apiUser.fechaNacimiento || "",
      password: apiUser.contrasena || "",
      status: apiUser.estado,
      fechaCreacion: new Date().toLocaleDateString('es-ES'),
      avatar: `${apiUser.nombre?.split(' ')[0]?.[0] || ''}${apiUser.apellido?.split(' ')[0]?.[0] || ''}`.toUpperCase(),
      imagenUrl: apiUser.fotoPerfil || "",
      rol: apiUser.rol?.nombre || (availableRoles.find(r => Number(r.id) === apiUser.rolId)?.nombre) || "Cliente"
    };
  };

  // Mapear datos del componente al formato de la API (DTO)
  const mapComponentToApiUser = (componentUser: any): UsuarioInput => {
    // Buscar el ID del rol basado en el nombre seleccionado
    const foundRole = availableRoles.find(r => r.nombre === componentUser.rol);
    const rolId = foundRole ? Number(foundRole.id) : 3; // Default: Cliente

    const apiUser: any = {
      nombre: componentUser.nombres,
      apellido: componentUser.apellidos,
      tipoDocumento: componentUser.tipoDocumento,
      documento: componentUser.documento,
      correo: componentUser.correo,
      telefono: componentUser.celular,
      direccion: componentUser.direccion,
      barrio: componentUser.barrio,
      contrasena: componentUser.password,
      estado: componentUser.status === 'active' || componentUser.status === true,
      fotoPerfil: componentUser.imagenUrl,
      rolId: rolId
    };

    // Solo incluir fechaNacimiento si tiene un valor válido
    if (componentUser.fechaNacimiento && componentUser.fechaNacimiento.trim() !== '') {
      apiUser.fechaNacimiento = componentUser.fechaNacimiento;
    }

    return apiUser;
  };
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [newUser, setNewUser] = useState({
    nombres: '',
    apellidos: '',
    tipoDocumento: '',
    documento: '',
    correo: '',
    celular: '',
    direccion: '',
    barrio: '',
    fechaNacimiento: '',
    password: '',
    rol: '',
    status: 'active',
    imagenUrl: ''
  });
  const userFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [userPreviewUrl, setUserPreviewUrl] = useState<string>('');
  const [createInFirebase, setCreateInFirebase] = useState(true);
  const [showUserFormErrors, setShowUserFormErrors] = useState(false);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Cargar usuarios y roles desde la API
  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Cargar roles primero para que mapApiUserToComponent los tenga disponibles
      const roles = await rolesApiService.getRolesWithModules();
      setAvailableRoles(roles);

      const apiUsers = await apiService.getUsuarios();

      // Mapear usuarios usando la función interna que conoce los roles
      const mappedUsers = apiUsers.map((apiUser) => ({
        id: apiUser.id,
        nombres: apiUser.nombre,
        apellidos: apiUser.apellido,
        tipoDocumento: apiUser.tipoDocumento || "Cédula",
        documento: apiUser.documento || "",
        correo: apiUser.correo,
        celular: apiUser.telefono || "",
        direccion: apiUser.direccion || "",
        barrio: apiUser.barrio || "",
        fechaNacimiento: apiUser.fechaNacimiento || "",
        password: apiUser.contrasena || "",
        status: apiUser.estado,
        fechaCreacion: new Date().toLocaleDateString('es-ES'),
        avatar: `${apiUser.nombre?.split(' ')[0]?.[0] || ''}${apiUser.apellido?.split(' ')[0]?.[0] || ''}`.toUpperCase(),
        imagenUrl: apiUser.fotoPerfil || "",
        rol: apiUser.rol?.nombre || (roles.find(r => Number(r.id) === apiUser.rolId)?.nombre) || "Cliente"
      }));

      setUsers(mappedUsers);
    } catch (error: any) {
      console.error('Error loading initial data:', error);
      toast.error('Error al cargar datos del sistema');
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    loadInitialData();
  }, []);

  // Filtros de usuario
  const filteredUsers = users.filter((user: any) => {
    const term = searchTerm.toLowerCase();
    const searchMatch =
      (user.nombres || '').toLowerCase().includes(term) ||
      (user.apellidos || '').toLowerCase().includes(term) ||
      (user.documento || '').toLowerCase().includes(term) ||
      (user.correo || '').toLowerCase().includes(term) ||
      (user.celular || '').toLowerCase().includes(term) ||
      (user.rol || '').toLowerCase().includes(term);

    const statusMatch =
      filterStatus === "all" ||
      user.status === (filterStatus === "true");

    return searchMatch && statusMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const displayedUsers = filteredUsers.slice(startIndex, startIndex + itemsPerPage);

  const resetForm = () => {
    setNewUser({
      nombres: '', apellidos: '', tipoDocumento: '', documento: '', correo: '', celular: '',
      direccion: '', barrio: '', fechaNacimiento: '', password: '', rol: '', status: 'active', imagenUrl: ''
    });
    setUserPreviewUrl('');
    if (userFileInputRef.current) {
      userFileInputRef.current.value = '';
    }
  };

  const triggerUserFileSelect = () => {
    userFileInputRef.current?.click();
  };

  // Función para subir imágenes al servidor usando el endpoint /api/upload
  // Este endpoint recibe un archivo (IFormFile) y lo guarda en wwwroot/assets/images/
  // Validaciones: Solo imágenes (jpg, jpeg, png, gif, webp) con nombre único GUID


  const handleUserImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showError('Formato no válido', 'Solo se permiten imágenes en formato JPG, PNG, GIF o WebP');
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showError('Archivo muy grande', 'La imagen no puede superar los 5MB');
      return;
    }

    try {
      setUploadingImage(true);

      // Mostrar preview mientras se sube
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setUserPreviewUrl(result);
      };
      reader.readAsDataURL(file);

      // Subir al servidor
      const imageUrl = await apiService.uploadImage(file);
      setNewUser((prev) => ({ ...prev, imagenUrl: imageUrl }));

      toast.success('Imagen subida exitosamente', {
        style: {
          background: 'var(--color-gray-darkest)',
          border: '1px solid var(--color-orange-primary)',
          color: 'var(--color-white-primary)',
        },
      });
    } catch (error: any) {
      console.error('Error uploading image:', error);
      showError('Error al subir imagen', 'No se pudo subir la imagen al servidor. Intenta nuevamente.');
      // Limpiar preview si falló
      setUserPreviewUrl('');
      if (userFileInputRef.current) {
        userFileInputRef.current.value = '';
      }
    } finally {
      setUploadingImage(false);
    }
  };

  const removeUserProfileImage = () => {
    const doClear = () => {
      setNewUser((prev) => ({ ...prev, imagenUrl: '' }));
      setUserPreviewUrl('');
      if (userFileInputRef.current) {
        userFileInputRef.current.value = '';
      }
    };
    try {
      if (editingUser?.id) {
        apiService.deleteUsuarioFoto(editingUser.id).catch(() => {});
      }
    } finally {
      doClear();
    }
  };

  const handleSendPasswordSetup = async (email: string) => {
    try {
      const res = await resetPassword(email);
      if (res.success) {
        showSuccess("Enlace enviado", "Se envió un enlace para configurar la contraseña.");
      } else {
        showError("No se pudo enviar", res.error || "Intenta nuevamente.");
      }
    } catch (e: any) {
      showError("No se pudo enviar", e?.message || "Intenta nuevamente.");
    }
  };

  const handleCreateUser = async () => {
    setShowUserFormErrors(true);
    if (!newUser.nombres || !newUser.apellidos || !newUser.documento || !newUser.correo || !newUser.celular || !newUser.rol) {
      return;
    }
    if (!isValidEmail(newUser.correo)) {
      return;
    }

    try {
      const tempPassword = Math.random().toString(36).slice(-8) + "A1";
      const apiUserData: any = mapComponentToApiUser(newUser);
      apiUserData.contrasena = tempPassword;

      // 1. Crear el Usuario base
      const createdUser = await apiService.createUsuario(apiUserData);
      const mappedUser = mapApiUserToComponent(createdUser);

      // 2. Crear perfil asociado según el Rol (Cliente o Barbero)
      const roleId = apiUserData.rolId;
      console.log(`👤 Usuario creado con ID: ${createdUser.id}, Rol ID: ${roleId}`);

      try {
        // Lógica para Clientes (Rol 3 = AppRole.CLIENTE) y Cajeros (Rol 6 = AppRole.CAJERO)
        // Ambos roles necesitan un perfil en la tabla Clientes para poder realizar transacciones
        if (roleId === 3 || roleId === 6) {
          console.log(`🔄 Creando perfil de Cliente asociado para rol ${roleId}...`);
          await clientesService.createCliente({
            usuarioId: createdUser.id,
            nombre: createdUser.nombre,
            apellido: createdUser.apellido,
            documento: createdUser.documento || newUser.documento, // Fallback al input
            correo: createdUser.correo,
            telefono: createdUser.telefono || newUser.celular,
            fechaNacimiento: createdUser.fechaNacimiento || undefined,
            direccion: createdUser.direccion || newUser.direccion,
            barrio: createdUser.barrio || newUser.barrio,
            fotoPerfil: createdUser.fotoPerfil || undefined
          });
          toast.success("Perfil de Cliente creado automáticamente");
        }
        // Lógica para Barberos (Rol 2 = AppRole.BARBERO)
        else if (roleId === 2) {
          console.log('🔄 Creando perfil de Barbero asociado...');
          await barberosService.createBarbero({
            usuarioId: createdUser.id,
            nombre: createdUser.nombre,
            apellido: createdUser.apellido,
            documento: createdUser.documento || newUser.documento,
            correo: createdUser.correo,
            telefono: createdUser.telefono || newUser.celular,
            especialidad: "General", // Valor por defecto
            fotoPerfil: createdUser.fotoPerfil || '',
            estado: true,
            direccion: createdUser.direccion || newUser.direccion,
            barrio: createdUser.barrio || newUser.barrio,
            fechaNacimiento: createdUser.fechaNacimiento || newUser.fechaNacimiento,
            tipoDocumento: createdUser.tipoDocumento || newUser.tipoDocumento || 'Cédula',
            rol: 'Barbero',
            status: 'active'
          });
          toast.success("Perfil de Barbero creado automáticamente");
        }
        // Otros roles (Admin, Recepcionista, Gerente) no requieren perfil adicional
        else {
          console.log(`ℹ️ Rol ${roleId} no requiere perfil adicional (Admin/Recepcionista/Gerente)`);
        }
      } catch (profileError) {
        console.error("❌ Error creando perfil asociado:", profileError);
        toast.warning("Usuario creado, pero hubo un error creando el perfil asociado (Cliente/Barbero).");
      }

      await notifyEntityCreated('usuario', {
        id: createdUser.id,
        nombre: createdUser.nombre,
        apellido: createdUser.apellido,
        correo: createdUser.correo,
        rolId: roleId
      });
      setUsers([mappedUser, ...users]);
      setIsCreateDialogOpen(false);
      showSuccess("¡Usuario creado exitosamente!", `El usuario "${mappedUser.nombres} ${mappedUser.apellidos}" ha sido registrado en el sistema.`);

      if (createInFirebase) {
        try {
          await firebaseAuthService.createUserWithoutAffectingSession(
            createdUser.correo,
            tempPassword,
            { sendVerification: false, sendPasswordReset: true }
          );
          toast.success('Cuenta creada en Firebase y enlace de contraseña enviado', {
            style: { background: 'var(--color-gray-darkest)', border: '1px solid var(--color-orange-primary)', color: 'var(--color-white-primary)' },
          });
        } catch (firebaseErr: any) {
          const msg = String(firebaseErr?.message || '').toLowerCase();
          if (msg.includes('ya está en uso') || msg.includes('already')) {
            const res = await resetPassword(createdUser.correo);
            if (res.success) {
              toast.success('El email ya existe en Firebase. Se envió enlace para configurar contraseña.');
            } else {
              toast.error('No se pudo enviar el enlace de contraseña en Firebase.');
            }
          } else {
            toast.error('No se pudo crear la cuenta en Firebase.');
          }
        }
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (typeof error === 'function') {
        showError('Error al crear usuario', 'No se pudo crear el usuario. Por favor, verifica los datos e intenta nuevamente.');
      } else {
        // Mostrar error con toast si no es función
        toast.error('Error al crear usuario', {
          style: {
            background: 'var(--color-gray-darkest)',
            border: '1px solid #DC2626',
            color: 'var(--color-white-primary)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
          },
          description: 'No se pudo crear el usuario. Por favor, verifica los datos e intenta nuevamente.'
        });
      }
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    setNewUser({
      nombres: user.nombres,
      apellidos: user.apellidos,
      tipoDocumento: user.tipoDocumento || '',
      documento: user.documento,
      correo: user.correo,
      celular: user.celular,
      direccion: user.direccion || '',
      barrio: user.barrio || '',
      fechaNacimiento: user.fechaNacimiento || '',
      password: user.password,
      rol: user.rol,
      status: user.status,
      imagenUrl: user.imagenUrl || ''
    });
    setUserPreviewUrl(user.imagenUrl || '');
    if (userFileInputRef.current) {
      userFileInputRef.current.value = '';
    }
    setIsDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    setShowUserFormErrors(true);
    if (!newUser.nombres || !newUser.apellidos || !newUser.documento || !newUser.correo || !newUser.celular || !newUser.rol) {
      return;
    }
    if (!isValidEmail(newUser.correo)) {
      return;
    }

    try {
      const apiUserData = mapComponentToApiUser(newUser);
      await apiService.updateUsuario(editingUser.id, apiUserData);

      const updatedUser = {
        ...editingUser,
        ...newUser,
        avatar: newUser.nombres.split(' ').map(n => n[0]).join('').toUpperCase() +
          newUser.apellidos.split(' ').map(n => n[0]).join('').toUpperCase()
      };

      setUsers(users.map((u: any) => u.id === editingUser.id ? updatedUser : u));
      showSuccess("Usuario actualizado", `Los datos de ${newUser.nombres} ${newUser.apellidos} han sido actualizados exitosamente.`);
      setIsDialogOpen(false);
      setEditingUser(null);
      resetForm();
    } catch (error: any) {
      console.error('Error updating user:', error);
      showError('Error al actualizar usuario', 'No se pudo actualizar el usuario. Por favor, verifica los datos e intenta nuevamente.');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await apiService.deleteUsuario(userToDelete.id);
      // Verificar borrado real
      let stillExists = false;
      try {
        const check = await apiService.getUsuarioById(userToDelete.id);
        if (check && (check.id || (check as any)?.Id)) stillExists = true;
      } catch { stillExists = false; }
      if (stillExists) {
        try {
          await apiService.updateUsuarioStatus(userToDelete.id, false);
          setUsers(prev => prev.map(u => u.id === userToDelete.id ? { ...u, status: false } : u));
          showSuccess('Usuario desactivado', 'Este usuario tiene registros asociados. Se desactivó para conservar el historial.');
          setUserToDelete(null);
          setIsDeleteDialogOpen(false);
        } catch {
          showError('No se puede eliminar', 'Este usuario tiene registros asociados (ventas, compras, agendamientos o entregas de insumos). Solo se puede desactivar para conservar el historial.');
        }
        return;
      }
      // Intentar eliminar el perfil asociado según el rol
      try {
        const rol = (userToDelete.rol || '').toLowerCase();
        const correo = userToDelete.correo;
        const documento = userToDelete.documento;
        const tipoDocumento = userToDelete.tipoDocumento;

        if (rol.includes('cliente') || rol.includes('cajero')) {
          const clientes = await clientesService.getClientes();
          const match = clientes.find((c: any) => {
            const cCorreo = (c.correo || c.Correo || '').toLowerCase();
            const cDoc = (c.documento || c.Documento || '').trim();
            const docFull = tipoDocumento && documento ? `${tipoDocumento} ${documento}` : documento;
            return (correo && cCorreo === (correo || '').toLowerCase()) || (documento && (cDoc === documento || cDoc === docFull));
          });
          if (match?.id) {
            await clientesService.deleteCliente(Number(match.id), { correo, documento, tipoDocumento });
          }
        } else if (rol.includes('barbero')) {
          const barberos = await barberosService.getBarberos();
          const mb = barberos.find((b: any) => {
            const bCorreo = (b.correo || '').toLowerCase();
            const bDoc = (b.documento || '').trim();
            const docFull = tipoDocumento && documento ? `${tipoDocumento} ${documento}` : documento;
            return (correo && bCorreo === (correo || '').toLowerCase()) || (documento && (bDoc === documento || bDoc === docFull));
          });
          if (mb?.id) {
            await barberosService.deleteBarbero(Number(mb.id), { correo, documento, tipoDocumento });
          }
        }
      } catch {
        // Ignorar errores de limpieza de perfil para no bloquear la eliminación del usuario
      }
      setUsers(users.filter(u => u.id !== userToDelete.id));
      showSuccess("Usuario eliminado", `El usuario ${userToDelete.nombres} ${userToDelete.apellidos} ha sido eliminado del sistema.`);
      setUserToDelete(null);
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      const errorMessage = error instanceof Error ? (error.message || '') : String(error || '');
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
          await apiService.updateUsuarioStatus(userToDelete.id, false);
          setUsers(prev => prev.map(u => u.id === userToDelete.id ? { ...u, status: false } : u));
          showSuccess('Usuario desactivado', 'Este usuario tiene registros asociados. Se desactivó para conservar el historial.');
          setUserToDelete(null);
          setIsDeleteDialogOpen(false);
        } catch {
          showError('No se puede eliminar', 'Este usuario tiene registros asociados (ventas, compras, agendamientos o entregas de insumos). Solo se puede desactivar para conservar el historial.');
        }
      } else {
        showError('Error al eliminar usuario', 'No se pudo eliminar el usuario. Por favor, intenta nuevamente.');
      }
    }
  };

  const toggleUserStatus = async (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // Prevenir que el administrador actual se desactive a sí mismo
    if (currentUser?.id === userId.toString() && user.status === true) {
      showError(
        "Acción no permitida",
        "No puedes desactivar tu propia cuenta mientras estás en una sesión activa. Pide a otro administrador que lo haga por ti."
      );
      return;
    }

    const newStatus = !user.status; // 🔥 si es false → true, si es true → false


    try {
      const loadingToast = toast.loading("Cambiando estado...");

      // Actualizar solo el estado (BOOLEAN)
      await apiService.updateUsuarioStatus(userId, newStatus);

      // Actualizar estado localmente
      setUsers(prev =>
        prev.map(u =>
          u.id === userId
            ? { ...u, status: newStatus }
            : u
        )
      );

      toast.dismiss(loadingToast);

      showSuccess(
        newStatus ? "Usuario activado" : "Usuario desactivado",
        `${user.nombres} ahora está ${newStatus ? "activo" : "inactivo"}`
      );

    } catch (err) {
      toast.dismiss();
      showError("Error", "No se pudo cambiar el estado");
    }
  };


  return (
    <>
      <header className="bg-black-primary border-b border-gray-dark px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white-primary">Gestión de Usuarios</h1>
            <p className="text-sm text-gray-lightest mt-1">Administra usuarios del sistema</p>
          </div>

        </div>
      </header>

      <main className="flex-1 overflow-auto p-8 bg-black-primary">
        <div style={{ display: 'none' }} className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="elegante-card text-center">
            <Users className="w-8 h-8 text-orange-primary mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">{filteredUsers.length}</h4>
            <p className="text-gray-lightest text-sm">Usuarios Totales</p>
          </div>
          <div className="elegante-card text-center">
            <UserCheck className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">
              {filteredUsers.filter(u => u.status === true).length}
            </h4>
            <p className="text-gray-lightest text-sm">Usuarios Activos</p>
          </div>
          <div className="elegante-card text-center">
            <UserX className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">
              {filteredUsers.filter(u => u.status === false).length}
            </h4>
            <p className="text-gray-lightest text-sm">Usuarios Inactivos</p>
          </div>
          <div className="elegante-card text-center">
            <Calendar className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <h4 className="text-2xl font-bold text-white-primary mb-1">
              {users.length}
            </h4>
            <p className="text-gray-lightest text-sm">Total Sistema</p>
          </div>
        </div>

        {/* Sección Principal */}
        <div className="elegante-card">
          {/* Barra de Controles */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-dark">
            <div className="flex flex-wrap items-center gap-4">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <button
                    className="elegante-button-primary gap-2 flex items-center"
                    onClick={() => {
                      setEditingUser(null);
                      resetForm();
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Nuevo Usuario
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-white-primary">
                      {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                    </DialogTitle>
                    <DialogDescription className="text-gray-lightest">
                      {editingUser ? 'Modifica los datos del usuario seleccionado' : 'Completa la información del nuevo usuario para agregarlo al sistema'}
                    </DialogDescription>
                  </DialogHeader>
                  {/* Foto de Perfil y Contraseña */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Camera className="w-4 h-4 text-orange-primary" />
                        Foto de Perfil
                      </Label>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <ImageRenderer url={userPreviewUrl} className="w-16 h-16 rounded-full" />
                          {userPreviewUrl && (
                            <button
                              onClick={removeUserProfileImage}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                              type="button"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <button
                          onClick={triggerUserFileSelect}
                          disabled={uploadingImage}
                          className="elegante-button-secondary text-xs px-3 py-1.5 gap-1.5 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                          type="button"
                        >
                          {uploadingImage ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Subiendo...
                            </>
                          ) : (
                            <>
                              <Camera className="w-3 h-3" />
                              {userPreviewUrl ? 'Cambiar' : 'Subir'}
                            </>
                          )}
                        </button>
                      </div>
                      <input
                        ref={userFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUserImageUpload}
                        className="hidden"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <IdCard className="w-4 h-4 text-orange-primary" />
                          Tipo de Documento *
                        </Label>
                        <select
                          value={newUser.tipoDocumento}
                          onChange={(e) => setNewUser({ ...newUser, tipoDocumento: e.target.value })}
                          className="elegante-input w-full"
                          disabled={editingUser !== null}
                        >
                          <option value="">Selecciona tipo de documento</option>
                          {tiposDocumento.map(tipo => (
                            <option key={tipo} value={tipo}>{tipo}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6 pt-4">
                    {/* Información Personal */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <IdCard className="w-4 h-4 text-orange-primary" />
                          Número de Documento *
                        </Label>
                        <Input
                          type="number"
                          value={newUser.documento}
                          onChange={(e) => {
                            const onlyDigits = e.target.value.replace(/\D/g, '');
                            setNewUser({ ...newUser, documento: onlyDigits });
                          }}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.documento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          placeholder="Número de documento"
                        />
                        {showUserFormErrors && !newUser.documento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-orange-primary" />
                          Nombres *
                        </Label>
                        <Input
                          value={newUser.nombres}
                          onChange={(e) => setNewUser({ ...newUser, nombres: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.nombres ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          placeholder="Ingresa los nombres"
                        />
                        {showUserFormErrors && !newUser.nombres && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-orange-primary" />
                          Apellidos *
                        </Label>
                        <Input
                          value={newUser.apellidos}
                          onChange={(e) => setNewUser({ ...newUser, apellidos: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.apellidos ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          placeholder="Ingresa los apellidos"
                        />
                        {showUserFormErrors && !newUser.apellidos && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-orange-primary" />
                          Fecha de Nacimiento
                        </Label>
                        <Input
                          type="date"
                          value={newUser.fechaNacimiento}
                          onChange={(e) => setNewUser({ ...newUser, fechaNacimiento: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.fechaNacimiento ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        />
                        {showUserFormErrors && !newUser.fechaNacimiento && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-orange-primary" />
                          Rol *
                        </Label>
                        <select
                          value={newUser.rol}
                          onChange={(e) => setNewUser({ ...newUser, rol: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.rol ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                        >
                          <option value="">Selecciona un rol</option>
                          {availableRoles.filter(r => r.estado).map(rol => (
                            <option key={rol.id} value={rol.nombre}>{rol.nombre}</option>
                          ))}
                        </select>
                        {showUserFormErrors && !newUser.rol && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <Mail className="w-4 h-4 text-orange-primary" />
                          Correo Electrónico *
                        </Label>
                        <Input
                          type="email"
                          value={newUser.correo}
                          onChange={(e) => setNewUser({ ...newUser, correo: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && (!newUser.correo || !isValidEmail(newUser.correo)) ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          placeholder="correo@ejemplo.com"
                        />
                        {showUserFormErrors && !newUser.correo && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                        {showUserFormErrors && newUser.correo && !isValidEmail(newUser.correo) && <p className="text-xs text-red-400">Formato de correo inválido.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <Phone className="w-4 h-4 text-orange-primary" />
                          Número de Celular *
                        </Label>
                        <Input
                          value={newUser.celular}
                          onChange={(e) => setNewUser({ ...newUser, celular: e.target.value })}
                          className={`elegante-input w-full ${showUserFormErrors && !newUser.celular ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          placeholder="+57 300 123 4567"
                        />
                        {showUserFormErrors && !newUser.celular && <p className="text-xs text-red-400">Este campo es obligatorio.</p>}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white-primary flex items-center gap-2">
                          <Home className="w-4 h-4 text-orange-primary" />
                          Dirección
                        </Label>
                        <Input
                          value={newUser.direccion}
                          onChange={(e) => setNewUser({ ...newUser, direccion: e.target.value })}
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
                          value={newUser.barrio}
                          onChange={(e) => setNewUser({ ...newUser, barrio: e.target.value })}
                          className="elegante-input w-full"
                          placeholder="Nombre del barrio"
                        />
                      </div>
                    </div>

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
                          setIsDialogOpen(false);
                          resetForm();
                          setEditingUser(null);
                        }}
                        className="elegante-button-secondary"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={editingUser ? handleUpdateUser : handleCreateUser}
                        className="elegante-button-primary"
                      >
                        {editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-lighter w-4 h-4 pointer-events-none z-10" />
                <Input
                  placeholder="Buscar usuarios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="elegante-input pl-11 w-80"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterStatus("all")}
                  className={`${filterStatus === "all"
                    ? "px-4 py-2 rounded-lg bg-orange-primary text-black-primary font-medium"
                    : "px-4 py-2 rounded-lg bg-gray-darker text-gray-lightest border border-gray-dark hover:bg-gray-dark"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("true")}
                  className={`${filterStatus === "true"
                    ? "px-4 py-2 rounded-lg bg-gray-700/60 text-white-primary border border-gray-600"
                    : "px-4 py-2 rounded-lg bg-gray-darker text-gray-lightest border border-gray-dark hover:bg-gray-dark"
                  }`}
                >
                  Activos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterStatus("false")}
                  className={`${filterStatus === "false"
                    ? "px-4 py-2 rounded-lg bg-gray-700/60 text-white-primary border border-gray-600"
                    : "px-4 py-2 rounded-lg bg-gray-darker text-gray-lightest border border-gray-dark hover:bg-gray-dark"
                  }`}
                >
                  Inactivos
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-orange-primary animate-spin" />
                <span className="ml-2 text-gray-lighter">Cargando usuarios...</span>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-dark">
                    <th className="text-left py-3 px-4 text-white-primary font-bold text-sm">Documento</th>
                    <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Usuario</th>

                    <th className="text-left py-3 px-4 text-white-primary font-bold text-sm">Contacto</th>
                    <th className="text-left py-3 px-4 text-white-primary font-bold text-sm">Rol</th>
                    <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Dirección</th>
                    <th className="text-center py-3 px-4 text-white-primary font-bold text-sm">Estado</th>
                    <th className="text-center  py-3 px-4 text-white-primary font-bold text-sm">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center">
                          <Users className="w-12 h-12 text-gray-lighter mb-4" />
                          <p className="text-gray-lighter">No se encontraron usuarios</p>
                          <p className="text-gray-lightest text-sm mt-2">
                            {searchTerm || filterStatus !== "all"
                              ? "Intenta ajustar los filtros de búsqueda"
                              : "Crea tu primer usuario usando el botón 'Nuevo Usuario'"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedUsers.map(user => (
                      <tr key={user.id} className="border-b border-gray-dark hover:bg-gray-darker transition-colors">
                        <td className="text-left py-4 px-4">
                          <span className="text-gray-lighter">{user.documento || "—"}</span>
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-left gap-3">
                            <ImageRenderer
                              url={user.imagenUrl}
                              alt={`Foto de ${user.nombres}`}
                              className="w-10 h-10 rounded-full border-2 border-orange-primary shadow-sm"
                            />
                            <span className="text-gray-lighter">{user.nombres}</span>
                          </div>
                        </td>
                        <td className="text-left py-4 px-4">
                          <span className="text-gray-lighter">{user.celular || "—"}</span>
                        </td>
                        <td className="text-left py-4 px-4">
                          <span className="text-gray-lighter">
                            {user.rol}
                          </span>
                        </td>
                        <td className="text-center py-4 px-4">
                          <span className="text-gray-lighter">{user.direccion || "—"}</span>
                        </td>
                        <td className="text-center py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-[2px]   ${user.status ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {user.status ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="text-right py-4 px-4">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => toggleUserStatus(user.id)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title={user.status ? "Desactivar usuario" : "Activar usuario"}
                            >
                              {user.status ? (
                                <ToggleRight className="w-4 h-4 text-gray-lightest group-hover:text-green-400" />
                              ) : (
                                <ToggleLeft className="w-4 h-4 text-gray-lightest group-hover:text-red-400" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setIsDetailDialogOpen(true);
                              }}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Ver detalles"
                            >
                              <Eye className="w-4 h-4 text-gray-lightest group-hover:text-orange-primary" />
                            </button>
                            <button
                              onClick={() => handleEditUser(user)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Editar usuario"
                            >
                              <Edit className="w-4 h-4 text-gray-lightest group-hover:text-blue-400" />
                            </button>
                            <button
                              onClick={() => handleSendPasswordSetup(user.correo)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Enviar enlace de contraseña"
                            >
                              <KeyRound className="w-4 h-4 text-gray-lightest group-hover:text-orange-primary" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-2 hover:bg-gray-darker rounded-lg transition-colors group"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-4 h-4 text-gray-lightest group-hover:text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
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
        </div>

        {/* Dialog de confirmación para actualizar usuario */}
        <AlertDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <AlertDialogContent className="bg-gray-darkest border-gray-dark">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white-primary">Confirmar Actualización</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-lightest">
                ¿Estás seguro de que deseas actualizar la información de este usuario? Los cambios se aplicarán inmediatamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-gray-darker border-gray-dark text-white-primary hover:bg-gray-dark">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleUpdateUser}
                className="elegante-button-primary"
              >
                Actualizar Usuario
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de confirmación para eliminar usuario */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent className="bg-gray-darkest border-gray-dark">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white-primary">Confirmar Eliminación</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-lightest">
                ¿Estás seguro de que deseas eliminar al usuario "{userToDelete?.nombres} {userToDelete?.apellidos}"?
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-gray-darker border-gray-dark text-white-primary hover:bg-gray-dark">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteUser}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                Eliminar Usuario
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog de detalles del usuario */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="bg-gray-darkest border-gray-dark max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white-primary">Detalles del Usuario</DialogTitle>
              <DialogDescription className="text-gray-lightest">
                Información completa del usuario seleccionado
              </DialogDescription>
            </DialogHeader>

            {selectedUser && (
              <>
                {/* Foto de Perfil y Tipo de Documento */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-white-primary flex items-center gap-2">
                      <Camera className="w-4 h-4 text-orange-primary" />
                      Foto de Perfil
                    </Label>
                    <div className="flex items-center gap-3">
                      <ImageRenderer url={selectedUser.imagenUrl} className="w-16 h-16 rounded-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <IdCard className="w-4 h-4 text-orange-primary" />
                        Tipo de Documento
                      </Label>
                      <Input
                        value={selectedUser.tipoDocumento}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6 pt-4">
                  {/* Información Personal */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <IdCard className="w-4 h-4 text-orange-primary" />
                        Número de Documento
                      </Label>
                      <Input
                        value={selectedUser.documento}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-orange-primary" />
                        Nombres
                      </Label>
                      <Input
                        value={selectedUser.nombres}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-orange-primary" />
                        Apellidos
                      </Label>
                      <Input
                        value={selectedUser.apellidos}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-orange-primary" />
                        Fecha de Nacimiento
                      </Label>
                      <Input
                        type="date"
                        value={selectedUser.fechaNacimiento}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-orange-primary" />
                        Rol
                      </Label>
                      <Input
                        value={selectedUser.rol}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Mail className="w-4 h-4 text-orange-primary" />
                        Correo Electrónico
                      </Label>
                      <Input
                        type="email"
                        value={selectedUser.correo}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Phone className="w-4 h-4 text-orange-primary" />
                        Número de Celular
                      </Label>
                      <Input
                        value={selectedUser.celular}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <Home className="w-4 h-4 text-orange-primary" />
                        Dirección
                      </Label>
                      <Input
                        value={selectedUser.direccion}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-orange-primary" />
                        Barrio
                      </Label>
                      <Input
                        value={selectedUser.barrio}
                        readOnly
                        className="elegante-input w-full bg-gray-dark cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white-primary flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-orange-primary" />
                        Estado
                      </Label>
                      <div className="flex items-center h-10 px-3 py-1 rounded-md bg-gray-dark border border-gray-medium cursor-not-allowed">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${selectedUser.status ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {selectedUser.status ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-6 border-t border-gray-dark">
                    <button
                      onClick={() => setIsDetailDialogOpen(false)}
                      className="elegante-button-secondary"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <AlertContainer />
      </main>
    </>
  );
}
