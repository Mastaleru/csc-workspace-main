const AccordionController  = require("./helpers/AccordionController");
const cscServices = require('csc-services');
const OrdersService = cscServices.OrderService;
const ShipmentsService = cscServices.ShipmentService;
const {getCommunicationServiceInstance} = cscServices.CommunicationService;
const FileDownloaderService = cscServices.FileDownloaderService;
const eventBusService = cscServices.EventBusService;
const viewModelResolver = cscServices.viewModelResolver;
const momentService = cscServices.momentService;
const { Roles, Topics, ButtonsEnum, Commons, FoldersEnum } = cscServices.constants;
const { orderStatusesEnum, orderPendingActionEnum } = cscServices.constants.order;
const { shipmentStatusesEnum } = cscServices.constants.shipment;
const KitsService = cscServices.KitsService;

class SingleOrderControllerImpl extends AccordionController {
  constructor(role, ...props) {
    super(...props);
    this.role = role;
    this.addedRefreshListeners = false;
    this.attachedSponsorEventsHandlers = false;
    this.attachedCMOEventsHandlers = false;

    const model = viewModelResolver('order');
    //all fields are disabled
    for (let prop in model.form.inputs) {
      model.form.inputs[prop].disabled = true;
    }
    this.model = model;

    let { keySSI } = this.history.location.state;
    this.model.keySSI = keySSI;

    this.initServices();

    //Init Check on Accordion Items
    if (this.model.accordion) {
      let keys = Object.keys(this.model.accordion);
      if (keys.length > 0) {
        keys.forEach((key) => {
          if (this.model.accordion[key].isOpened) {
            this.openAccordionItem(this.model.accordion[key].id);
          }
        });
      }
    }

    this.onTagEvent('order_details_accordion', 'click', (e) => {
      this.toggleAccordionItem('order_details_accordion');
      this.model.accordion.order_details.isOpened = !this.model.accordion.order_details.isOpened;
    });

    this.onTagEvent('attached_documents_accordion', 'click', (e) => {
      this.toggleAccordionItem('attached_documents_accordion');
      this.model.accordion.attached_documents.isOpened = !this.model.accordion.attached_documents.isOpened;
    });

    this.onTagEvent('order_comments_accordion', 'click', (e) => {
      this.toggleAccordionItem('order_comments_accordion');
      this.model.accordion.order_comments.isOpened = !this.model.accordion.order_comments.isOpened;
    });

    this.onTagEvent('history-button', 'click', (e) => {
      this.onShowHistoryClick();
    });

    this.onTagClick('download-file', async (model, target, event) => {
      const filename = target.getAttribute('data-custom') || null;
      if (filename) {
        if (model.name && model.name === filename) {
          const document = this.model.order.documents.find((x) => x.name === filename);
          const keySSI = document.attached_by === Roles.Sponsor ? this.model.order.sponsorDocumentsKeySSI : this.model.order.cmoDocumentsKeySSI;
          await this.downloadFile(filename, FoldersEnum.Documents, keySSI);
        } else {
          await this.downloadFile(filename, FoldersEnum.Kits, model.order.kitsSSI);
        }
      }
    });

    this.navigationHandlers();
   
  }

  async initServices(){
    this.FileDownloaderService = new FileDownloaderService(this.DSUStorage);
    let communicationService = getCommunicationServiceInstance();
    this.ordersService = new OrdersService(this.DSUStorage, communicationService);
    this.shipmentsService = new ShipmentsService(this.DSUStorage, communicationService);
    this.kitsService = new KitsService(this.DSUStorage);
    this.init();

  }

  navigationHandlers() {
    this.onTagClick('nav-back', () => {
      this.history.goBack();
    });

    this.onTagClick('dashboard', () => {
      this.navigateToPageTag('dashboard', { tab: Topics.Order });
    });
  }

  closeAllExcept(el) {

    if (el === 'order_details_accordion') {
      this.closeAccordionItem('order_comments_accordion');
    }

    if (el === 'order_comments_accordion') {
      this.closeAccordionItem('order_details_accordion');
    }
  }

  async onShowHistoryClick() {
    let { order, shipment } = this.model.toObject();
    const historyModel = {
      order: order,
      shipment: shipment,
      currentPage: Topics.Order
    };

    if (this.role === Roles.Sponsor) {
      try{
        historyModel.kits = await this.kitsService.getOrderKits(order.studyId, order.orderId);
      }
      catch (e){
        historyModel.kits = []
      }
    }

    this.createWebcModal({
      template: 'historyModal',
      controller: 'HistoryModalController',
      model: historyModel,
      disableBackdropClosing: false,
      disableFooter: true,
      disableExpanding: true,
      disableClosing: false,
      disableCancelButton: true,
      expanded: false,
      centered: true
    });
  }

  async init() {
    const order = await this.ordersService.getOrder(this.model.keySSI);
    this.model.order = order;
    this.model.order = { ...this.transformOrderData(this.model.order) };
    this.model.order.delivery_date = {
      date: this.getDate(this.model.order.deliveryDate),
      time: this.getTime(this.model.order.deliveryDate)
    };

    if (this.model.order.shipmentSSI) {
      const shipment = await this.shipmentsService.getShipment(this.model.order.shipmentSSI);
      this.model.shipment = this.transformShipmentData(shipment);
      if (this.model.shipment.status_value !== shipmentStatusesEnum.InPreparation) {
        this.model.order.pending_action = orderPendingActionEnum.NoFurtherActionsRequired;
      }
    }

    this.model.order.actions = this.setOrderActions();
    this.attachRefreshListeners();
  }

   attachRefreshListeners() {

     if (!this.addedRefreshListeners) {
       this.addedRefreshListeners = true;
       this.refreshModalOpened = false;

       // Here is a known semantic issue: when both shipment and order are canceled,
       // but from the business point of view the application is not presenting any bug because the order will refresh
       // and will prevent the shipment refresh to trigger

       eventBusService.addEventListener(Topics.RefreshOrders + this.model.order.orderId, this.showOrderUpdateModal.bind(this));
       if(this.model.shipment){
         eventBusService.addEventListener(Topics.RefreshShipments + this.model.shipment.shipmentId,  this.showOrderUpdateModal.bind(this));
       }
     }
  }

  showOrderUpdateModal() {
    if (!this.refreshModalOpened) {
      this.refreshModalOpened = true;
      let title = 'Order Updated';
      let content = 'Order was updated';
      let modalOptions = {
        disableExpanding: true,
        disableClosing: true,
        disableCancelButton: true,
        confirmButtonText: 'Update View',
        id: 'confirm-modal'
      };
      this.showModal(content, title, this.init.bind(this), this.init.bind(this), modalOptions);
    }
  }

  transformOrderData(data) {
    if (data) {
      data.documents = [];

      data.status_value = data.status.sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
      })[0].status;

      data.status_date = momentService(
        data.status.sort(function(a, b) {
          return new Date(b.date) - new Date(a.date);
        })[0].date
      ).format(Commons.DateTimeFormatPattern);

      data.status_approved = data.status_value === orderStatusesEnum.Approved;
      data.status_cancelled = data.status_value === orderStatusesEnum.Canceled;
      data.status_normal = data.status_value !== orderStatusesEnum.Canceled && data.status_value !== orderStatusesEnum.Approved;
      data.pending_action = this.getPendingAction(data.status_value);

      if (data.comments) {
        data.comments.forEach((comment) => {
          comment.date = momentService(comment.date).format(Commons.DateTimeFormatPattern);
        });
      }

      if (data.sponsorDocuments) {
        data.sponsorDocuments.forEach((doc) => {
          doc.date = momentService(doc.date).format(Commons.DateTimeFormatPattern);
          data.documents.push(doc);
        });
      }

      if (data.cmoDocuments) {
        data.cmoDocuments.forEach((doc) => {
          doc.date = momentService(doc.date).format(Commons.DateTimeFormatPattern);
          data.documents.push(doc);
        });
      }

      return data;
    }

    return {};
  }

  transformShipmentData(shipment) {
    if (shipment) {
      shipment.status_value = shipment.status.sort(function(a, b) {
        return new Date(b.date) - new Date(a.date);
      })[0].status;

      return shipment;
    }

    return null;
  }

  getPendingAction(status_value) {
    switch (status_value) {
      case orderStatusesEnum.Initiated:
        return orderPendingActionEnum.PendingReviewByCMO;

      case orderStatusesEnum.ReviewedByCMO:
        return orderPendingActionEnum.SponsorReviewOrApprove;

      case orderStatusesEnum.Canceled:
        return orderPendingActionEnum.NoPendingActions;

      case orderStatusesEnum.Approved:
        return orderPendingActionEnum.PendingShipmentPreparation;
    }

    return '';
  }

  setOrderActions() {
    const order = this.model.order;
    const shipment = this.model.shipment;
    const isShipmentCreated = typeof shipment !== 'undefined';
    const canCMOReviewStatuses = [orderStatusesEnum.Initiated];
    const canSponsorReviewStatuses = [orderStatusesEnum.ReviewedByCMO];
    const cancellableOrderStatus = [orderStatusesEnum.Initiated, orderStatusesEnum.ReviewedByCMO, orderStatusesEnum.Approved, shipmentStatusesEnum.InPreparation];
    const actions = {};

    switch (this.role) {
      case Roles.Sponsor:
        actions.canBeCancelled = cancellableOrderStatus.indexOf(order.status_value) !== -1 && (!shipment || cancellableOrderStatus.indexOf(shipment.status_value) !== -1);
        actions.canBeApproved = canSponsorReviewStatuses.indexOf(order.status_value) !== -1;
        actions.orderCancelButtonText = isShipmentCreated ? ButtonsEnum.CancelOrderAndShipment : ButtonsEnum.CancelOrder;
        this.attachSponsorEventHandlers();
        break;

      case Roles.CMO:
        actions.canPrepareShipment = !isShipmentCreated && orderStatusesEnum.Approved === order.status_value;
        actions.canBeReviewed = canCMOReviewStatuses.indexOf(order.status_value) !== -1;
        this.attachCmoEventHandlers();
        break;
    }

    return actions;
  }

  attachSponsorEventHandlers() {
    if(this.attachedSponsorEventsHandlers){
      return;
    }

    this.onTagEvent('cancel-order', 'click', () => {
      this.model.cancelOrderModal = viewModelResolver('order').cancelOrderModal;
      this.showModalFromTemplate('cancelOrderModal', this.cancelOrder.bind(this), () => {
      }, {
          controller: 'CancelOrderController',
          disableExpanding: true,
          disableBackdropClosing: true,
          model: this.model
        });
    });

    this.onTagEvent('approve-order', 'click', () => {
      let title = 'Approve Order';
      let content = 'Are you sure you want to approve the order?';
      let modalOptions = {
        disableExpanding: true,
        cancelButtonText: 'No',
        confirmButtonText: 'Yes',
        id: 'confirm-modal'
      };

      this.showModal(content, title, this.approveOrder.bind(this), () => {}, modalOptions);
    });
    this.attachedSponsorEventsHandlers = true;
  }

  async cancelOrder() {
    const { keySSI } = this.model.order;
    let comment = this.model.cancelOrderModal.comment.value ? {
      entity: this.role,
      comment: this.model.cancelOrderModal.comment.value,
      date: new Date().getTime()
    }
      : null;
    await this.ordersService.updateOrderNew(keySSI, null, comment, this.role, orderStatusesEnum.Canceled);
    const shipment = this.model.shipment;
    let orderLabel = 'Order';
    if (shipment) {
      orderLabel = 'Order and Shipment';
      await this.shipmentsService.updateShipment(shipment.keySSI, shipmentStatusesEnum.ShipmentCancelled);
      eventBusService.emitEventListeners(Topics.RefreshShipments, null);
    }

    eventBusService.emitEventListeners(Topics.RefreshOrders, null);
    this.showErrorModalAndRedirect(orderLabel + ' was canceled, redirecting to dashboard...', orderLabel + ' Cancelled', '/', 2000);
  }

  async approveOrder() {
    const {keySSI} = this.model.order;
    await this.ordersService.updateOrderNew(keySSI, null, null, this.role, orderStatusesEnum.Approved);
    eventBusService.emitEventListeners(Topics.RefreshOrders, null);
    this.showErrorModalAndRedirect('Order was approved, redirecting to dashboard...', 'Order Approved', '/', 2000);
  }

  attachCmoEventHandlers() {

    if(this.attachedCMOEventsHandlers){
      return;
    }

    this.onTagEvent('review-order', 'click', () => {
      this.navigateToPageTag('review-order', {
        order: this.model.toObject('order')
      });
    });

    this.onTagEvent('prepare-shipment', 'click', async () => {
      window.WebCardinal.loader.hidden = false;
      const order = this.model.order;
      const shipmentResult = await this.shipmentsService.createShipment(order);

      const otherOrderDetails = {
        shipmentSSI: shipmentResult.keySSI
      };
      await this.ordersService.updateOrderNew(order.keySSI, null, null, Roles.CMO, null, otherOrderDetails);
      eventBusService.emitEventListeners(Topics.RefreshOrders, null);
      eventBusService.emitEventListeners(Topics.RefreshShipments, null);
      window.WebCardinal.loader.hidden = true;
      this.createWebcModal({
        template: 'prepareShipmentModal',
        controller: 'PrepareShipmentModalController',
        model: { ...shipmentResult },
        disableBackdropClosing: false,
        disableFooter: true,
        disableHeader: true,
        disableExpanding: true,
        disableClosing: true,
        disableCancelButton: true,
        expanded: false,
        centered: true
      });
    });
    this.attachedCMOEventsHandlers = true;
  }



  getDate(timestamp) {
    return momentService(timestamp).format(Commons.DateFormatPattern);
  }

  getTime(timestamp) {
    return momentService(timestamp).format(Commons.HourFormatPattern);
  }

  async downloadFile(filename, rootFolder, keySSI) {
    window.WebCardinal.loader.hidden = false;
    const path = rootFolder + '/' + keySSI + '/' + 'files';
    await this.FileDownloaderService.prepareDownloadFromDsu(path, filename);
    this.FileDownloaderService.downloadFileToDevice(filename);
    window.WebCardinal.loader.hidden = true;
  }
}

const controllersRegistry = require('../ControllersRegistry').getControllersRegistry();
controllersRegistry.registerController('SingleOrderController', SingleOrderControllerImpl);
